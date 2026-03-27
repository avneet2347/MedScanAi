import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api-utils";
import type { MedicineReminderRecord, ReminderTimeSlot } from "@/lib/report-types";

type SupabaseLikeError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
};

const REMINDERS_NOT_READY_MESSAGE =
  "Medicine reminders are not initialized for this Supabase project yet. Re-run supabase/schema.sql to enable reminder storage.";

type NormalizedReminderTimeSlot = {
  time: string;
  label: string | null;
};

function isMissingSupabaseTableError(
  error: SupabaseLikeError | null | undefined,
  tableName: string
) {
  const normalizedTableName = tableName.includes(".") ? tableName : `public.${tableName}`;
  const message = error?.message?.toLowerCase() || "";
  const details = error?.details?.toLowerCase() || "";
  const code = error?.code?.toUpperCase() || "";

  return (
    message.includes(`could not find the table '${normalizedTableName}'`) ||
    message.includes(`relation "${normalizedTableName}" does not exist`) ||
    details.includes(normalizedTableName) ||
    ((code === "PGRST205" || code === "42P01") &&
      (message.includes(normalizedTableName) || details.includes(normalizedTableName)))
  );
}

function isMissingSupabaseColumnError(
  error: SupabaseLikeError | null | undefined,
  tableName: string
) {
  const message = error?.message?.toLowerCase() || "";
  const code = error?.code?.toUpperCase() || "";

  return (
    code === "42703" &&
    (message.includes(`column ${tableName.toLowerCase()}.`) ||
      message.includes(`column public.${tableName.toLowerCase()}.`))
  );
}

function throwRemindersApiError(error: SupabaseLikeError | null | undefined) {
  if (isMissingSupabaseTableError(error, "medicine_reminders")) {
    throw new ApiError(REMINDERS_NOT_READY_MESSAGE, 503);
  }

  if (isMissingSupabaseColumnError(error, "medicine_reminders")) {
    throw new ApiError(REMINDERS_NOT_READY_MESSAGE, 503);
  }
}

function normalizeReminderTimes(value: unknown): ReminderTimeSlot[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === "string") {
        return {
          time: item,
          label: null,
        };
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

function normalizeReminderRecord(record: Record<string, unknown>) {
  return {
    id: String(record.id || ""),
    user_id: String(record.user_id || ""),
    report_id: record.report_id ? String(record.report_id) : null,
    medicine_name: String(record.medicine_name || ""),
    dosage: record.dosage ? String(record.dosage) : null,
    schedule: String(record.schedule || ""),
    instructions: record.instructions ? String(record.instructions) : null,
    reminder_times: normalizeReminderTimes(record.reminder_times),
    active: Boolean(record.active),
    created_at: String(record.created_at || ""),
    updated_at: String(record.updated_at || ""),
  } satisfies MedicineReminderRecord;
}

export async function listMedicineReminders(
  supabase: SupabaseClient,
  reportId?: string | null
) {
  let query = supabase
    .from("medicine_reminders")
    .select("*")
    .order("active", { ascending: false })
    .order("created_at", { ascending: false });

  if (reportId) {
    query = query.eq("report_id", reportId);
  }

  const { data, error } = await query;

  if (error) {
    throwRemindersApiError(error);
    throw new Error(error.message);
  }

  return (data || []).map((row) =>
    normalizeReminderRecord(row as Record<string, unknown>)
  );
}

export async function listMedicineRemindersSafely(
  supabase: SupabaseClient,
  reportId?: string | null
) {
  try {
    return await listMedicineReminders(supabase, reportId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 503) {
      return [] as MedicineReminderRecord[];
    }

    throw error;
  }
}

export async function createMedicineReminder(
  supabase: SupabaseClient,
  payload: {
    user_id: string;
    report_id?: string | null;
    medicine_name: string;
    dosage?: string | null;
    schedule: string;
    instructions?: string | null;
    reminder_times: ReminderTimeSlot[];
    active?: boolean;
  }
) {
  const { data, error } = await supabase
    .from("medicine_reminders")
    .insert({
      ...payload,
      active: payload.active ?? true,
    })
    .select("*")
    .single();

  if (error || !data) {
    throwRemindersApiError(error);
    throw new Error(error?.message || "Failed to create reminder.");
  }

  return normalizeReminderRecord(data as Record<string, unknown>);
}

export async function updateMedicineReminder(
  supabase: SupabaseClient,
  reminderId: string,
  payload: Partial<{
    medicine_name: string;
    dosage: string | null;
    schedule: string;
    instructions: string | null;
    reminder_times: ReminderTimeSlot[];
    active: boolean;
  }>
) {
  const { data, error } = await supabase
    .from("medicine_reminders")
    .update(payload)
    .eq("id", reminderId)
    .select("*")
    .single();

  if (error || !data) {
    throwRemindersApiError(error);
    throw new Error(error?.message || "Failed to update reminder.");
  }

  return normalizeReminderRecord(data as Record<string, unknown>);
}

export async function deleteMedicineReminder(
  supabase: SupabaseClient,
  reminderId: string
) {
  const { error } = await supabase
    .from("medicine_reminders")
    .delete()
    .eq("id", reminderId);

  if (error) {
    throwRemindersApiError(error);
    throw new Error(error.message);
  }
}
