import { NextResponse } from "next/server";
import { getErrorMessage, getErrorStatus, jsonError } from "@/lib/api-utils";
import { ensureUserProfile } from "@/lib/reports";
import {
  createMedicineReminder,
  listMedicineRemindersSafely,
} from "@/lib/reminders";
import type { ReminderTimeSlot } from "@/lib/report-types";
import { requireAuthenticatedUser } from "@/lib/supabase-server";

export const runtime = "nodejs";

type NormalizedReminderTimeSlot = {
  time: string;
  label: string | null;
};

function normalizeReminderTimes(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as ReminderTimeSlot[];
  }

  return value
    .map((item) => {
      if (typeof item === "string") {
        const time = item.trim();
        return time ? { time, label: null } : null;
      }

      if (!item || typeof item !== "object") {
        return null;
      }

      const slot = item as { time?: unknown; label?: unknown };
      const time = typeof slot.time === "string" ? slot.time.trim() : "";

      if (!time) {
        return null;
      }

      return {
        time,
        label: typeof slot.label === "string" ? slot.label.trim() || null : null,
      };
    })
    .filter((item): item is NormalizedReminderTimeSlot => Boolean(item));
}

function isValidTimeSlot(time: string) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(time);
}

export async function GET(request: Request) {
  try {
    const reportId = new URL(request.url).searchParams.get("reportId")?.trim();
    const { user, dataClient } = await requireAuthenticatedUser(request);
    await ensureUserProfile(dataClient, user);

    const reminders = await listMedicineRemindersSafely(dataClient, reportId);

    return NextResponse.json({
      reminders,
    });
  } catch (error) {
    return jsonError(
      getErrorMessage(error, "Unable to fetch reminders."),
      getErrorStatus(error, 500)
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as
      | {
          reportId?: string | null;
          medicineName?: string;
          dosage?: string | null;
          schedule?: string;
          instructions?: string | null;
          reminderTimes?: unknown;
          active?: boolean;
        }
      | null;

    const medicineName = body?.medicineName?.trim();
    const schedule = body?.schedule?.trim();
    const reminderTimes = normalizeReminderTimes(body?.reminderTimes);

    if (!medicineName) {
      return jsonError("medicineName is required.");
    }

    if (!schedule) {
      return jsonError("schedule is required.");
    }

    if (reminderTimes.length === 0) {
      return jsonError("At least one reminder time is required.");
    }

    if (!reminderTimes.every((slot) => isValidTimeSlot(slot.time))) {
      return jsonError("Reminder times must use HH:mm format.");
    }

    const { user, dataClient } = await requireAuthenticatedUser(request);
    await ensureUserProfile(dataClient, user);

    const reminder = await createMedicineReminder(dataClient, {
      user_id: user.id,
      report_id: body?.reportId?.trim() || null,
      medicine_name: medicineName,
      dosage: body?.dosage?.trim() || null,
      schedule,
      instructions: body?.instructions?.trim() || null,
      reminder_times: reminderTimes,
      active: body?.active ?? true,
    });

    return NextResponse.json({
      message: "Reminder created.",
      reminder,
    });
  } catch (error) {
    return jsonError(
      getErrorMessage(error, "Unable to create reminder."),
      getErrorStatus(error, 500)
    );
  }
}
