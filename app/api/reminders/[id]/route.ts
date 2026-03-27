import { NextResponse } from "next/server";
import { getErrorMessage, getErrorStatus, jsonError } from "@/lib/api-utils";
import { ensureUserProfile } from "@/lib/reports";
import {
  deleteMedicineReminder,
  updateMedicineReminder,
} from "@/lib/reminders";
import { requireAuthenticatedUser } from "@/lib/supabase-server";

export const runtime = "nodejs";

type NormalizedReminderTimeSlot = {
  time: string;
  label: string | null;
};

function hasOwn(input: object, key: string) {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function normalizeReminderTimes(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const slots = value
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

  return slots;
}

function isValidTimeSlot(time: string) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(time);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as
      | {
          medicineName?: string;
          dosage?: string | null;
          schedule?: string;
          instructions?: string | null;
          reminderTimes?: unknown;
          active?: boolean;
        }
      | null;

    if (body && hasOwn(body, "reminderTimes") && !Array.isArray(body.reminderTimes)) {
      return jsonError("reminderTimes must be an array of HH:mm entries.");
    }

    const reminderTimes = normalizeReminderTimes(body?.reminderTimes);

    if (
      reminderTimes &&
      (!reminderTimes.length || !reminderTimes.every((slot) => isValidTimeSlot(slot.time)))
    ) {
      return jsonError("Reminder times must use HH:mm format.");
    }

    const updates: Parameters<typeof updateMedicineReminder>[2] = {};

    if (body && hasOwn(body, "medicineName")) {
      const medicineName = body.medicineName?.trim();

      if (!medicineName) {
        return jsonError("medicineName cannot be empty.");
      }

      updates.medicine_name = medicineName;
    }

    if (body && hasOwn(body, "dosage")) {
      updates.dosage = typeof body.dosage === "string" ? body.dosage.trim() || null : null;
    }

    if (body && hasOwn(body, "schedule")) {
      const schedule = body.schedule?.trim();

      if (!schedule) {
        return jsonError("schedule cannot be empty.");
      }

      updates.schedule = schedule;
    }

    if (body && hasOwn(body, "instructions")) {
      updates.instructions =
        typeof body.instructions === "string" ? body.instructions.trim() || null : null;
    }

    if (body && hasOwn(body, "reminderTimes")) {
      updates.reminder_times = reminderTimes;
    }

    if (typeof body?.active === "boolean") {
      updates.active = body.active;
    }

    if (Object.keys(updates).length === 0) {
      return jsonError("No reminder changes were provided.");
    }

    const { user, dataClient } = await requireAuthenticatedUser(request);
    await ensureUserProfile(dataClient, user);

    const reminder = await updateMedicineReminder(dataClient, id, updates);

    return NextResponse.json({
      message: "Reminder updated.",
      reminder,
    });
  } catch (error) {
    return jsonError(
      getErrorMessage(error, "Unable to update reminder."),
      getErrorStatus(error, 500)
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { user, dataClient } = await requireAuthenticatedUser(request);
    await ensureUserProfile(dataClient, user);

    await deleteMedicineReminder(dataClient, id);

    return NextResponse.json({
      message: "Reminder deleted.",
    });
  } catch (error) {
    return jsonError(
      getErrorMessage(error, "Unable to delete reminder."),
      getErrorStatus(error, 500)
    );
  }
}
