"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  MedicineEntry,
  MedicineReminderRecord,
  ReminderTimeSlot,
  ReportDetail,
} from "@/lib/report-types";

type Props = {
  authorizedFetchJson: (input: string, init?: RequestInit) => Promise<Record<string, unknown>>;
  selectedReport: ReportDetail | null;
};

type ReminderSuggestion = {
  medicineName: string;
  dosage: string;
  schedule: string;
  instructions: string;
};

type ReminderNotificationState = NotificationPermission | "unsupported";

const ALARM_SOUND_PATH = "/alarm.mp3";
const REMINDER_CHECK_INTERVAL_MS = 1000;
const REMINDER_LOOKBACK_MS = 60_000;

function createAlarmAudioElement() {
  const audio = new Audio(ALARM_SOUND_PATH);
  audio.preload = "auto";
  audio.loop = false;
  audio.load();
  return audio;
}

function padTimeSegment(value: number) {
  return String(value).padStart(2, "0");
}

function buildLocalReminderDateKey(value: Date) {
  return `${value.getFullYear()}-${padTimeSegment(value.getMonth() + 1)}-${padTimeSegment(
    value.getDate()
  )}`;
}

function parseReminderClockTime(time: string) {
  const match = time.match(/^([01]\d|2[0-3]):([0-5]\d)$/);

  if (!match) {
    return null;
  }

  return {
    hours: Number(match[1]),
    minutes: Number(match[2]),
  };
}

function buildReminderDateTime(reference: Date, time: string) {
  const parsed = parseReminderClockTime(time);

  if (!parsed) {
    return null;
  }

  return new Date(
    reference.getFullYear(),
    reference.getMonth(),
    reference.getDate(),
    parsed.hours,
    parsed.minutes,
    0,
    0
  );
}

function formatReminderTriggerTime(value: Date) {
  return value.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function getReminderScheduleDateKey(reminder: MedicineReminderRecord) {
  const source = reminder.updated_at || reminder.created_at;

  if (!source) {
    return null;
  }

  const scheduledOn = new Date(source);

  if (Number.isNaN(scheduledOn.getTime())) {
    return null;
  }

  return buildLocalReminderDateKey(scheduledOn);
}

function resolveTodayReminderSchedule(reference: Date, reminderTimes: ReminderTimeSlot[]) {
  const scheduledTimes = reminderTimes
    .map((slot) => ({
      slot,
      scheduledAt: buildReminderDateTime(reference, slot.time),
    }))
    .filter((item): item is { slot: ReminderTimeSlot; scheduledAt: Date } => Boolean(item.scheduledAt));

  if (scheduledTimes.length !== reminderTimes.length) {
    return {
      error: "Use reminder times in HH:mm format, for example 08:00 or 20:00.",
      nextTriggerAt: null as Date | null,
    };
  }

  const pastSlot = scheduledTimes.find((item) => item.scheduledAt.getTime() <= reference.getTime());

  if (pastSlot) {
    return {
      error: `Choose a reminder time later today. ${pastSlot.slot.time} has already passed.`,
      nextTriggerAt: null as Date | null,
    };
  }

  return {
    error: null,
    nextTriggerAt: scheduledTimes
      .map((item) => item.scheduledAt)
      .sort((left, right) => left.getTime() - right.getTime())[0] || null,
  };
}

function isValidTimeSlot(time: string) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(time);
}

function normalizeTimeSlots(input: string) {
  return input
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((time) => ({
      time,
      label: null,
    }));
}

function formatTimeSlots(slots: ReminderTimeSlot[]) {
  return slots.map((slot) => slot.time).join(", ");
}

function guessReminderTimes(schedule: string): ReminderTimeSlot[] {
  const normalized = schedule.toLowerCase();

  if (normalized.includes("morning and evening")) {
    return [
      { time: "08:00", label: "Morning" },
      { time: "20:00", label: "Evening" },
    ];
  }

  if (normalized.includes("morning, afternoon, and night")) {
    return [
      { time: "08:00", label: "Morning" },
      { time: "14:00", label: "Afternoon" },
      { time: "20:00", label: "Night" },
    ];
  }

  if (normalized.includes("every morning")) {
    return [{ time: "08:00", label: "Morning" }];
  }

  if (normalized.includes("at night")) {
    return [{ time: "21:00", label: "Night" }];
  }

  return [{ time: "09:00", label: "Reminder" }];
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-IN");
}

function suggestionKey(item: ReminderSuggestion) {
  return `${item.medicineName}::${item.schedule}`;
}

function buildSuggestionFromMedicine(medicine: MedicineEntry): ReminderSuggestion {
  return {
    medicineName: medicine.name,
    dosage: medicine.dosage || "",
    schedule: medicine.frequency?.trim() || "As prescribed",
    instructions:
      medicine.notes?.trim() ||
      medicine.purpose?.trim() ||
      "Use exactly as prescribed in the uploaded report.",
  };
}

export default function WorkspaceRemindersPanel({
  authorizedFetchJson,
  selectedReport,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reminders, setReminders] = useState<MedicineReminderRecord[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [draftTimes, setDraftTimes] = useState<Record<string, string>>({});
  const [editingReminderId, setEditingReminderId] = useState<string | null>(null);
  const [editSchedule, setEditSchedule] = useState("");
  const [editTimes, setEditTimes] = useState("");
  const [editInstructions, setEditInstructions] = useState("");
  const [notificationPermission, setNotificationPermission] =
    useState<ReminderNotificationState>("default");
  const triggeredReminderKeysRef = useRef<Set<string>>(new Set());
  const lastReminderCheckAtRef = useRef<number>(0);
  const alarmAudioRef = useRef<HTMLAudioElement | null>(null);
  const alarmAudioUnlockedRef = useRef(false);
  const pendingAlarmPlaybackRef = useRef(false);
  const audioBlockedNoticeShownRef = useRef(false);

  const showAlarmBlockedNotice = useCallback((message: string) => {
    if (audioBlockedNoticeShownRef.current) {
      return;
    }

    audioBlockedNoticeShownRef.current = true;
    setNotice(message);
  }, []);

  const syncNotificationPermission = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }

    setNotificationPermission(Notification.permission);
  }, []);

  const reminderSuggestions = useMemo(
    () =>
      ((selectedReport?.analysis_json?.medicines || []) as MedicineEntry[]).map(
        buildSuggestionFromMedicine
      ),
    [selectedReport]
  );

  const loadReminders = useCallback(async () => {
    if (!selectedReport?.id) {
      setReminders([]);
      return;
    }

    setLoading(true);

    try {
      const payload = await authorizedFetchJson(
        `/api/reminders?reportId=${encodeURIComponent(selectedReport.id)}`
      );
      setReminders((payload.reminders as MedicineReminderRecord[] | undefined) || []);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to load reminders.");
    } finally {
      setLoading(false);
    }
  }, [authorizedFetchJson, selectedReport?.id]);

  useEffect(() => {
    void loadReminders();
  }, [loadReminders]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    alarmAudioRef.current = createAlarmAudioElement();

    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }

    syncNotificationPermission();
  }, [syncNotificationPermission]);

  const playAlarmSound = useCallback(async () => {
    if (typeof window === "undefined") {
      return false;
    }

    if (document.hidden) {
      pendingAlarmPlaybackRef.current = true;
      return false;
    }

    const playAudio = async (audio: HTMLAudioElement) => {
      audio.pause();
      audio.currentTime = 0;
      audio.muted = false;
      audio.volume = 1;
      await audio.play();
    };

    let audio = alarmAudioRef.current;

    if (!audio) {
      audio = createAlarmAudioElement();
      alarmAudioRef.current = audio;
    }

    try {
      await playAudio(audio);
      alarmAudioUnlockedRef.current = true;
      pendingAlarmPlaybackRef.current = false;
      audioBlockedNoticeShownRef.current = false;
      return true;
    } catch (error) {
      console.warn("Reminder alarm playback failed on the primary audio element.", error);
      const fallbackAudio = createAlarmAudioElement();
      alarmAudioRef.current = fallbackAudio;

      try {
        await playAudio(fallbackAudio);
        alarmAudioUnlockedRef.current = true;
        pendingAlarmPlaybackRef.current = false;
        audioBlockedNoticeShownRef.current = false;
        return true;
      } catch (fallbackError) {
        console.warn("Reminder alarm playback failed on the fallback audio element.", fallbackError);
        pendingAlarmPlaybackRef.current = true;
        return false;
      }
    }
  }, []);

  const primeAlarmAudio = useCallback(async () => {
    if (typeof window === "undefined") {
      return false;
    }

    let audio = alarmAudioRef.current;

    if (!audio) {
      audio = createAlarmAudioElement();
      alarmAudioRef.current = audio;
    }

    if (!alarmAudioUnlockedRef.current) {
      try {
        audio.muted = true;
        audio.volume = 0;
        audio.currentTime = 0;
        await audio.play();
        audio.pause();
        audio.currentTime = 0;
        audio.muted = false;
        audio.volume = 1;
        alarmAudioUnlockedRef.current = true;
      } catch (error) {
        console.warn("Reminder alarm priming was blocked before the reminder fired.", error);
        audio.muted = false;
        audio.volume = 1;
        return false;
      }
    }

    if (pendingAlarmPlaybackRef.current) {
      pendingAlarmPlaybackRef.current = false;
      audioBlockedNoticeShownRef.current = false;
      return playAlarmSound();
    }

    return true;
  }, [playAlarmSound]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const unlockAlarmAudio = () => {
      void primeAlarmAudio();
    };

    window.addEventListener("pointerdown", unlockAlarmAudio);
    window.addEventListener("keydown", unlockAlarmAudio);

    return () => {
      window.removeEventListener("pointerdown", unlockAlarmAudio);
      window.removeEventListener("keydown", unlockAlarmAudio);
    };
  }, [primeAlarmAudio]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handlePermissionRefresh = () => {
      syncNotificationPermission();
    };

    window.addEventListener("focus", handlePermissionRefresh);
    document.addEventListener("visibilitychange", handlePermissionRefresh);

    return () => {
      window.removeEventListener("focus", handlePermissionRefresh);
      document.removeEventListener("visibilitychange", handlePermissionRefresh);
    };
  }, [syncNotificationPermission]);

  const showReminderNotification = useCallback(
    async (title: string, options: NotificationOptions) => {
      if (typeof window === "undefined" || !("Notification" in window)) {
        return false;
      }

      syncNotificationPermission();

      if (Notification.permission !== "granted") {
        return false;
      }

      try {
        new Notification(title, options);
        return true;
      } catch (error) {
        console.warn("Reminder notification could not be shown.", error);
        return false;
      }
    },
    [syncNotificationPermission]
  );

  const ensureReminderNotifications = useCallback(
    async (silent = false) => {
      if (typeof window === "undefined") {
        return "unsupported" as ReminderNotificationState;
      }

      void primeAlarmAudio();

      if (!("Notification" in window)) {
        setNotificationPermission("unsupported");
        if (!silent) {
          setNotice("This browser does not support reminder pop-up notifications.");
        }
        return "unsupported" as ReminderNotificationState;
      }

      if (Notification.permission === "granted") {
        setNotificationPermission("granted");
        if (!silent) {
          setNotice("Reminder alerts are enabled for this browser.");
        }
        return "granted" as ReminderNotificationState;
      }

      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);

      if (permission !== "granted" && !silent) {
        setNotice("Reminder alerts are still blocked in this browser.");
      }

      return permission;
    },
    [primeAlarmAudio]
  );

  useEffect(() => {
    if (typeof window === "undefined" || reminders.length === 0) {
      return;
    }

    const checkReminders = () => {
      if (!document.hidden && pendingAlarmPlaybackRef.current) {
        void playAlarmSound().then((didPlay) => {
          if (!didPlay) {
            showAlarmBlockedNotice(
              "Reminder sound is blocked in this browser. Click once in this tab to allow alarm audio."
            );
          }
        });
      }

      const now = new Date();
      const nowTimestamp = now.getTime();
      const previousCheckTimestamp =
        lastReminderCheckAtRef.current || nowTimestamp - REMINDER_LOOKBACK_MS;
      const currentDateKey = buildLocalReminderDateKey(now);

      lastReminderCheckAtRef.current = nowTimestamp;

      triggeredReminderKeysRef.current.forEach((key) => {
        if (!key.startsWith(`${currentDateKey}:`)) {
          triggeredReminderKeysRef.current.delete(key);
        }
      });

      reminders.forEach((reminder) => {
        if (!reminder.active) {
          return;
        }

        const reminderDateKey = getReminderScheduleDateKey(reminder);

        if (reminderDateKey && reminderDateKey !== currentDateKey) {
          return;
        }

        reminder.reminder_times?.forEach((slot) => {
          const scheduledAt = buildReminderDateTime(now, slot.time);

          if (!scheduledAt) {
            return;
          }

          const scheduledTimestamp = scheduledAt.getTime();
          const reminderKey = `${currentDateKey}:${reminder.id}:${slot.time}`;

          if (
            scheduledTimestamp <= previousCheckTimestamp ||
            scheduledTimestamp > nowTimestamp ||
            triggeredReminderKeysRef.current.has(reminderKey)
          ) {
            return;
          }

          triggeredReminderKeysRef.current.add(reminderKey);
          setNotice(
            `Reminder: ${reminder.medicine_name} is scheduled for ${slot.time}. ${
              reminder.instructions || "Please take it as prescribed."
            }`
          );

          void showReminderNotification(`Time for ${reminder.medicine_name}`, {
              body: reminder.instructions || `Scheduled for ${slot.time}`,
              tag: reminderKey,
              requireInteraction: true,
            });

          void playAlarmSound().then((didPlay) => {
            if (!didPlay) {
              showAlarmBlockedNotice(
                `Reminder: ${reminder.medicine_name} is scheduled for ${slot.time}. Click once in this tab to enable the alarm sound in this browser.`
              );
            }
          });
        });
      });
    };

    checkReminders();
    const interval = window.setInterval(checkReminders, REMINDER_CHECK_INTERVAL_MS);
    window.addEventListener("focus", checkReminders);
    document.addEventListener("visibilitychange", checkReminders);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", checkReminders);
      document.removeEventListener("visibilitychange", checkReminders);
    };
  }, [playAlarmSound, reminders, showAlarmBlockedNotice, showReminderNotification]);

  useEffect(() => {
    setDraftTimes(
      Object.fromEntries(
        reminderSuggestions.map((item) => [
          suggestionKey(item),
          formatTimeSlots(guessReminderTimes(item.schedule)),
        ])
      )
    );
    setEditingReminderId(null);
    setEditSchedule("");
    setEditTimes("");
    setEditInstructions("");
    setNotice(null);
  }, [reminderSuggestions]);

  async function createReminder(payload: {
    medicineName: string;
    dosage?: string;
    schedule: string;
    instructions?: string;
    reminderTimes: ReminderTimeSlot[];
  }) {
    const scheduleResolution = resolveTodayReminderSchedule(new Date(), payload.reminderTimes);

    if (scheduleResolution.error) {
      setNotice(scheduleResolution.error);
      return;
    }

    await primeAlarmAudio();
    setSaving(true);
    setNotice(null);

    try {
      const permission = await ensureReminderNotifications(true);
      const nextTriggerAt = scheduleResolution.nextTriggerAt;

      await authorizedFetchJson("/api/reminders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reportId: selectedReport?.id || null,
          medicineName: payload.medicineName,
          dosage: payload.dosage || null,
          schedule: payload.schedule,
          instructions: payload.instructions || null,
          reminderTimes: payload.reminderTimes,
        }),
      });
      await loadReminders();
      setNotice(
        permission === "granted"
          ? nextTriggerAt
            ? `Reminder set. Browser alerts are enabled for today at ${formatReminderTriggerTime(nextTriggerAt)}.`
            : "Reminder set. Browser alerts are enabled for the scheduled time."
          : nextTriggerAt
            ? `Reminder set for today at ${formatReminderTriggerTime(nextTriggerAt)}. Enable browser notifications if you also want pop-up alerts.`
            : "Reminder set. Enable browser notifications if you also want pop-up alerts."
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to save reminder.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleReminder(reminder: MedicineReminderRecord) {
    setSaving(true);
    setNotice(null);

    try {
      await authorizedFetchJson(`/api/reminders/${reminder.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          active: !reminder.active,
        }),
      });
      await loadReminders();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to update reminder.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteReminder(reminderId: string) {
    setSaving(true);
    setNotice(null);

    try {
      await authorizedFetchJson(`/api/reminders/${reminderId}`, {
        method: "DELETE",
      });
      await loadReminders();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to delete reminder.");
    } finally {
      setSaving(false);
    }
  }

  function startEditing(reminder: MedicineReminderRecord) {
    setEditingReminderId(reminder.id);
    setEditSchedule(reminder.schedule);
    setEditTimes(formatTimeSlots(reminder.reminder_times));
    setEditInstructions(reminder.instructions || "");
    setNotice(null);
  }

  function stopEditing() {
    setEditingReminderId(null);
    setEditSchedule("");
    setEditTimes("");
    setEditInstructions("");
  }

  async function saveReminderEdits(reminder: MedicineReminderRecord) {
    const reminderTimes = normalizeTimeSlots(editTimes);

    if (!editSchedule.trim()) {
      setNotice("Schedule is required.");
      return;
    }

    if (reminderTimes.length === 0 || !reminderTimes.every((slot) => isValidTimeSlot(slot.time))) {
      setNotice("Use 24-hour reminder times in HH:mm format, for example 08:00 or 20:00.");
      return;
    }

    const scheduleResolution = resolveTodayReminderSchedule(new Date(), reminderTimes);

    if (scheduleResolution.error) {
      setNotice(scheduleResolution.error);
      return;
    }

    await primeAlarmAudio();
    setSaving(true);
    setNotice(null);

    try {
      const nextTriggerAt = scheduleResolution.nextTriggerAt;

      await authorizedFetchJson(`/api/reminders/${reminder.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          schedule: editSchedule.trim(),
          instructions: editInstructions.trim() || null,
          reminderTimes,
        }),
      });
      await loadReminders();
      stopEditing();
      setNotice(
        nextTriggerAt
          ? `Reminder updated. The next alert is scheduled for today at ${formatReminderTriggerTime(nextTriggerAt)}.`
          : "Reminder updated."
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to update reminder.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="workspace-addon-card">
      <div className="workspace-addon-header">
        <div>
          <h3>Medicine reminders</h3>
          <p>Set reminder times from the medicines already extracted in this report and edit them anytime.</p>
        </div>
        <div className="workspace-addon-meta">
          <span>{reminders.length} saved</span>
          <button
            type="button"
            className="alarm-toggle-button"
            onClick={() => {
              void ensureReminderNotifications();
            }}
            disabled={notificationPermission === "unsupported"}
          >
            {notificationPermission === "granted"
              ? "Alerts enabled"
              : notificationPermission === "unsupported"
                ? "Alerts unavailable"
                : "Enable alerts"}
          </button>
        </div>
      </div>

      {notice ? <div className="reminder-notice">{notice}</div> : null}

      <div className="reminder-grid">
        <div className="reminder-column">
          <h4>Extracted medicines</h4>
          {reminderSuggestions.length === 0 ? (
            <div className="workspace-addon-empty">
              No medicines were extracted from this report yet.
            </div>
          ) : (
            <div className="reminder-list">
              {reminderSuggestions.map((item) => (
                <article key={`${item.medicineName}-${item.schedule}`} className="reminder-card">
                  <strong>{item.medicineName}</strong>
                  <span>{item.dosage || "Dosage not extracted"}</span>
                  <p>{item.schedule}</p>
                  <small>{item.instructions}</small>
                  <label className="field-label">
                    Reminder time(s)
                    <input
                      value={draftTimes[suggestionKey(item)] || ""}
                      onChange={(event) =>
                        setDraftTimes((current) => ({
                          ...current,
                          [suggestionKey(item)]: event.target.value,
                        }))
                      }
                      placeholder="08:00, 20:00"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={
                      saving ||
                      !normalizeTimeSlots(draftTimes[suggestionKey(item)] || "").length ||
                      !normalizeTimeSlots(draftTimes[suggestionKey(item)] || "").every((slot) =>
                        isValidTimeSlot(slot.time)
                      )
                    }
                    onClick={() =>
                      createReminder({
                        medicineName: item.medicineName,
                        dosage: item.dosage,
                        schedule: item.schedule,
                        instructions: item.instructions,
                        reminderTimes: normalizeTimeSlots(draftTimes[suggestionKey(item)] || ""),
                      })
                    }
                  >
                    Set Reminder
                  </button>
                  <small className="helper-text">
                    Use 24-hour `HH:mm` format, for example `08:00` or `20:00`. Add multiple
                    times with commas. Alerts ring at the saved time.
                  </small>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="reminder-column">
          <h4>Saved for this report</h4>
          {loading ? (
            <div className="workspace-addon-empty">Loading reminders...</div>
          ) : reminders.length === 0 ? (
            <div className="workspace-addon-empty">No reminders saved yet.</div>
          ) : (
            <div className="reminder-list">
              {reminders.map((reminder) => (
                <article key={reminder.id} className="reminder-card">
                  {editingReminderId === reminder.id ? (
                    <div className="edit-form">
                      <div className="reminder-card-head">
                        <div>
                          <strong>{reminder.medicine_name}</strong>
                          <span>{reminder.dosage || "Dosage not extracted"}</span>
                        </div>
                        <span className={`status-pill ${reminder.active ? "active" : "paused"}`}>
                          {reminder.active ? "Active" : "Paused"}
                        </span>
                      </div>
                      <label className="field-label">
                        Schedule
                        <input
                          value={editSchedule}
                          onChange={(event) => setEditSchedule(event.target.value)}
                          placeholder="Schedule"
                        />
                      </label>
                      <label className="field-label">
                        Reminder time(s)
                        <input
                          value={editTimes}
                          onChange={(event) => setEditTimes(event.target.value)}
                          placeholder="08:00, 20:00"
                        />
                      </label>
                      <label className="field-label">
                        Instructions
                        <textarea
                          value={editInstructions}
                          onChange={(event) => setEditInstructions(event.target.value)}
                          placeholder="Extra instructions"
                          rows={3}
                        />
                      </label>
                      <div className="reminder-actions">
                        <button type="button" disabled={saving} onClick={() => saveReminderEdits(reminder)}>
                          Save changes
                        </button>
                        <button type="button" className="secondary-button" disabled={saving} onClick={stopEditing}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="reminder-card-head">
                        <div>
                          <strong>{reminder.medicine_name}</strong>
                          <span>{reminder.schedule}</span>
                        </div>
                        <span className={`status-pill ${reminder.active ? "active" : "paused"}`}>
                          {reminder.active ? "Active" : "Paused"}
                        </span>
                      </div>
                      <p>{reminder.instructions || "No extra instructions saved."}</p>
                      <div className="time-pill-row">
                        {reminder.reminder_times.map((slot) => (
                          <span key={`${reminder.id}-${slot.time}`} className="time-pill">
                            {slot.label ? `${slot.label}: ` : ""}
                            {slot.time}
                          </span>
                        ))}
                      </div>
                      <small>Created {formatDate(reminder.created_at)}</small>
                      <div className="reminder-actions">
                        <button type="button" disabled={saving} onClick={() => startEditing(reminder)}>
                          Edit
                        </button>
                        <button type="button" disabled={saving} onClick={() => toggleReminder(reminder)}>
                          {reminder.active ? "Pause" : "Activate"}
                        </button>
                        <button type="button" disabled={saving} onClick={() => deleteReminder(reminder.id)}>
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .workspace-addon-card {
          border: 1px solid var(--ws-border);
          border-radius: 28px;
          padding: 24px;
          background: linear-gradient(180deg, var(--ws-surface-strong), var(--ws-surface));
        }

        .workspace-addon-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 18px;
        }

        .workspace-addon-meta {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .workspace-addon-header h3,
        .reminder-column h4 {
          margin: 0 0 6px;
        }

        .workspace-addon-header p,
        .workspace-addon-header span {
          margin: 0;
          color: var(--ws-muted);
        }

        .reminder-notice {
          margin-bottom: 14px;
          border-radius: 14px;
          padding: 12px 14px;
          background: rgba(14, 165, 233, 0.12);
          color: var(--ws-text-soft);
        }

        .reminder-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 18px;
        }

        .reminder-column {
          display: grid;
          gap: 14px;
        }

        .workspace-addon-empty {
          border: 1px dashed var(--ws-border-strong);
          border-radius: 18px;
          padding: 16px;
          color: var(--ws-muted);
          background: var(--ws-surface-soft);
        }

        .reminder-list {
          display: grid;
          gap: 12px;
        }

        .reminder-card,
        .edit-form {
          border: 1px solid var(--ws-border);
          border-radius: 18px;
          padding: 16px;
          background: var(--ws-surface-soft);
        }

        .reminder-card strong {
          display: block;
        }

        .reminder-card span,
        .reminder-card small,
        .reminder-card p {
          display: block;
          margin-top: 4px;
          color: var(--ws-text-soft);
        }

        .reminder-card button,
        .edit-form button {
          border: none;
          border-radius: 12px;
          padding: 10px 12px;
          font-weight: 700;
          background: linear-gradient(135deg, var(--ws-accent), var(--ws-accent-2));
          color: white;
          cursor: pointer;
          margin-top: 12px;
        }

        .alarm-toggle-button {
          border: 1px solid var(--ws-border);
          border-radius: 999px;
          padding: 9px 12px;
          background: rgba(14, 165, 233, 0.1);
          color: var(--ws-accent);
          font-weight: 700;
          cursor: pointer;
        }

        .alarm-toggle-button:disabled {
          cursor: not-allowed;
          opacity: 0.65;
        }

        .edit-form {
          display: grid;
          gap: 10px;
        }

        .field-label {
          display: grid;
          gap: 8px;
          color: var(--ws-text-soft);
          font-size: 0.88rem;
        }

        .field-label input,
        .field-label textarea {
          border: 1px solid var(--ws-border);
          border-radius: 12px;
          padding: 12px 14px;
          background: rgba(255, 255, 255, 0.7);
          color: var(--ws-text);
          font: inherit;
          resize: vertical;
        }

        .reminder-card-head,
        .reminder-actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .status-pill,
        .time-pill {
          border-radius: 999px;
          padding: 6px 10px;
          font-size: 0.78rem;
          font-weight: 700;
        }

        .status-pill.active {
          color: var(--ws-success);
          background: var(--ws-success-bg);
        }

        .status-pill.paused {
          color: var(--ws-warning);
          background: var(--ws-warning-bg);
        }

        .time-pill-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 10px;
        }

        .time-pill {
          color: var(--ws-accent);
          background: rgba(14, 165, 233, 0.12);
        }

        .helper-text {
          color: var(--ws-muted);
        }

        .secondary-button {
          background: rgba(148, 163, 184, 0.16) !important;
          color: var(--ws-text) !important;
        }

        .reminder-actions button:last-child {
          background: rgba(248, 113, 113, 0.14);
          color: var(--ws-danger);
        }

        @media (max-width: 720px) {
          .workspace-addon-header {
            flex-direction: column;
          }

          .workspace-addon-meta {
            width: 100%;
            justify-content: flex-start;
          }
        }
      `}</style>
    </section>
  );
}
