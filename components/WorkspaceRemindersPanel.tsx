"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  REMINDER_ALARM_TONES,
  type ReminderAlarmTone,
  type MedicineEntry,
  type MedicineReminderRecord,
  type ReminderTimeSlot,
  type ReportDetail,
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
type ReminderScheduleResolution = {
  error: string | null;
  nextTriggerAt: Date | null;
};
type ParsedReminderTimeInput = {
  reminderTimes: ReminderTimeSlot[];
  invalidEntries: string[];
};

const DEFAULT_REMINDER_TONE: ReminderAlarmTone = "default";
const REMINDER_TONE_LABELS: Record<ReminderAlarmTone, string> = {
  default: "Default",
  soft: "Soft",
  beep: "Beep",
  alert: "Alert",
};
const REMINDER_TONE_PATHS: Record<ReminderAlarmTone, string> = {
  default: "/tones/default.mp3",
  soft: "/tones/soft.mp3",
  beep: "/tones/beep.mp3",
  alert: "/tones/alert.mp3",
};
const REMINDER_TIME_HINT = "Use reminder times like 8:00 AM or 8:00 PM.";
const REMINDER_CHECK_INTERVAL_MS = 1000;
const REMINDER_LOOKBACK_MS = 60_000;

function normalizeReminderTone(value: unknown): ReminderAlarmTone {
  return REMINDER_ALARM_TONES.find((tone) => tone === value) || DEFAULT_REMINDER_TONE;
}

function getReminderToneLabel(tone: ReminderAlarmTone) {
  return REMINDER_TONE_LABELS[normalizeReminderTone(tone)];
}

function getReminderTonePath(tone: ReminderAlarmTone) {
  return REMINDER_TONE_PATHS[normalizeReminderTone(tone)];
}

function createAlarmAudioElement(tone: ReminderAlarmTone = DEFAULT_REMINDER_TONE) {
  const audio = new Audio(getReminderTonePath(tone));
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

function isValidReminderDate(value: Date | null | undefined): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function parseReminderClockTime(time: string | null | undefined) {
  const normalizedTime = typeof time === "string" ? time.trim() : "";
  const match = normalizedTime.match(/^([01]\d|2[0-3]):([0-5]\d)$/);

  if (!match) {
    return null;
  }

  return {
    hours: Number(match[1]),
    minutes: Number(match[2]),
  };
}

function buildLocalReminderDateTimeValue(reference: Date, time: string, dayOffset = 0) {
  if (!isValidReminderDate(reference)) {
    return null;
  }

  const parsed = parseReminderClockTime(time);

  if (!parsed) {
    return null;
  }

  const targetDate = new Date(reference.getTime());
  targetDate.setHours(0, 0, 0, 0);
  targetDate.setDate(targetDate.getDate() + dayOffset);

  if (!isValidReminderDate(targetDate)) {
    return null;
  }

  return `${buildLocalReminderDateKey(targetDate)}T${padTimeSegment(parsed.hours)}:${padTimeSegment(
    parsed.minutes
  )}:00`;
}

function buildReminderDateTime(reference: Date, time: string, dayOffset = 0) {
  const reminderDateTimeValue = buildLocalReminderDateTimeValue(reference, time, dayOffset);

  if (!reminderDateTimeValue) {
    return null;
  }

  const scheduledAt = new Date(reminderDateTimeValue);
  return isValidReminderDate(scheduledAt) ? scheduledAt : null;
}

function parseReminderInputClockTime(time: string | null | undefined) {
  const normalizedTime =
    typeof time === "string" ? time.trim().replace(/\s+/g, " ").toUpperCase() : "";
  const match = normalizedTime.match(/^(0?[1-9]|1[0-2]):([0-5]\d)\s?(AM|PM)$/);

  if (!match) {
    return null;
  }

  let hours = Number(match[1]) % 12;
  const minutes = Number(match[2]);

  if (match[3] === "PM") {
    hours += 12;
  }

  return {
    hours,
    minutes,
  };
}

function formatStoredReminderClockTime(time: string | null | undefined) {
  const parsed = parseReminderClockTime(time);

  if (!parsed) {
    return typeof time === "string" ? time : "";
  }

  const period = parsed.hours >= 12 ? "PM" : "AM";
  const displayHours = parsed.hours % 12 || 12;

  return `${displayHours}:${padTimeSegment(parsed.minutes)} ${period}`;
}

function formatReminderTriggerTime(value: Date) {
  return value.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function isSameLocalReminderDate(left: Date, right: Date) {
  return buildLocalReminderDateKey(left) === buildLocalReminderDateKey(right);
}

function formatReminderTriggerLabel(value: Date, reference: Date) {
  const timeLabel = formatReminderTriggerTime(value);

  if (isSameLocalReminderDate(value, reference)) {
    return `today at ${timeLabel}`;
  }

  const tomorrow = new Date(reference.getTime());
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (isSameLocalReminderDate(value, tomorrow)) {
    return `tomorrow at ${timeLabel}`;
  }

  return `on ${value.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })} at ${timeLabel}`;
}

function hasInvalidReminderTimeSlots(reminderTimes: ReminderTimeSlot[] | null | undefined) {
  return !Array.isArray(reminderTimes) || reminderTimes.some((slot) => !parseReminderClockTime(slot?.time));
}

function resolveNextReminderSchedule(
  reference: Date,
  reminderTimes: ReminderTimeSlot[]
): ReminderScheduleResolution {
  if (!isValidReminderDate(reference)) {
    return {
      error: "Unable to read the current time. Please try again.",
      nextTriggerAt: null,
    };
  }

  const scheduledTimes = reminderTimes
    .map((slot) => {
      const scheduledAtToday = buildReminderDateTime(reference, slot.time);

      if (!scheduledAtToday) {
        return null;
      }

      const scheduledAt =
        scheduledAtToday.getTime() >= reference.getTime()
          ? scheduledAtToday
          : buildReminderDateTime(reference, slot.time, 1);

      if (!scheduledAt) {
        return null;
      }

      return {
        slot,
        scheduledAt,
      };
    })
    .filter((item): item is { slot: ReminderTimeSlot; scheduledAt: Date } => Boolean(item?.scheduledAt));

  if (scheduledTimes.length !== reminderTimes.length) {
    return {
      error: REMINDER_TIME_HINT,
      nextTriggerAt: null,
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
  return Boolean(parseReminderClockTime(time));
}

function parseReminderTimeInput(input: string): ParsedReminderTimeInput {
  return input
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce<ParsedReminderTimeInput>(
      (result, entry) => {
        const parsed = parseReminderInputClockTime(entry);

        if (!parsed) {
          result.invalidEntries.push(entry);
          return result;
        }

        result.reminderTimes.push({
          time: `${padTimeSegment(parsed.hours)}:${padTimeSegment(parsed.minutes)}`,
          label: null,
        });

        return result;
      },
      {
        reminderTimes: [],
        invalidEntries: [],
      }
    );
}

function formatTimeSlots(slots: ReminderTimeSlot[]) {
  return slots.map((slot) => formatStoredReminderClockTime(slot.time)).join(", ");
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
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
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
  const [alarmActive, setAlarmActive] = useState(false);
  const [draftTimes, setDraftTimes] = useState<Record<string, string>>({});
  const [draftTones, setDraftTones] = useState<Record<string, ReminderAlarmTone>>({});
  const [editingReminderId, setEditingReminderId] = useState<string | null>(null);
  const [editSchedule, setEditSchedule] = useState("");
  const [editTimes, setEditTimes] = useState("");
  const [editInstructions, setEditInstructions] = useState("");
  const [editTone, setEditTone] = useState<ReminderAlarmTone>(DEFAULT_REMINDER_TONE);
  const [notificationPermission, setNotificationPermission] =
    useState<ReminderNotificationState>("default");
  const triggeredReminderKeysRef = useRef<Set<string>>(new Set());
  const lastReminderCheckAtRef = useRef<number>(0);
  const alarmAudioRef = useRef<HTMLAudioElement | null>(null);
  const playingAlarmAudioRef = useRef<HTMLAudioElement | null>(null);
  const alarmToneRef = useRef<ReminderAlarmTone>(DEFAULT_REMINDER_TONE);
  const alarmAudioUnlockedRef = useRef(false);
  const alarmPrimingRef = useRef(false);
  const pendingAlarmPlaybackRef = useRef(false);
  const pendingAlarmToneRef = useRef<ReminderAlarmTone>(DEFAULT_REMINDER_TONE);
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

  const bindAlarmAudioLifecycle = useCallback((audio: HTMLAudioElement) => {
    audio.onplay = () => {
      if (alarmPrimingRef.current) {
        return;
      }

      playingAlarmAudioRef.current = audio;
      setAlarmActive(true);
    };

    audio.onpause = () => {
      if (playingAlarmAudioRef.current === audio) {
        playingAlarmAudioRef.current = null;
      }

      if (!alarmPrimingRef.current) {
        setAlarmActive(false);
      }
    };

    audio.onended = () => {
      if (playingAlarmAudioRef.current === audio) {
        playingAlarmAudioRef.current = null;
      }

      setAlarmActive(false);
    };
  }, []);

  const ensureAlarmAudioElement = useCallback((tone: ReminderAlarmTone) => {
    const normalizedTone = normalizeReminderTone(tone);
    let audio = alarmAudioRef.current;

    if (!audio) {
      audio = createAlarmAudioElement(normalizedTone);
      bindAlarmAudioLifecycle(audio);
      alarmAudioRef.current = audio;
      alarmToneRef.current = normalizedTone;
      return audio;
    }

    if (alarmToneRef.current !== normalizedTone) {
      audio.pause();
      audio.currentTime = 0;
      audio.src = getReminderTonePath(normalizedTone);
      audio.load();
      alarmToneRef.current = normalizedTone;
    }

    return audio;
  }, [bindAlarmAudioLifecycle]);

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
      const nextReminders = (payload.reminders as MedicineReminderRecord[] | undefined) || [];
      setReminders(nextReminders);

      if (nextReminders.some((reminder) => hasInvalidReminderTimeSlots(reminder.reminder_times))) {
        setNotice("Some saved reminders have invalid times. Edit them to use times like 8:00 AM or 8:00 PM.");
      }
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

    const audio = createAlarmAudioElement(DEFAULT_REMINDER_TONE);
    alarmAudioRef.current = audio;
    bindAlarmAudioLifecycle(audio);
    alarmToneRef.current = DEFAULT_REMINDER_TONE;

    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }

    syncNotificationPermission();
    return () => {
      const audio = alarmAudioRef.current;

      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }

      playingAlarmAudioRef.current = null;
    };
  }, [bindAlarmAudioLifecycle, syncNotificationPermission]);

  const playAlarmSound = useCallback(async (tone: ReminderAlarmTone = DEFAULT_REMINDER_TONE) => {
    if (typeof window === "undefined") {
      return false;
    }

    const normalizedTone = normalizeReminderTone(tone);

    if (document.hidden) {
      pendingAlarmPlaybackRef.current = true;
      pendingAlarmToneRef.current = normalizedTone;
      return false;
    }

    const playAudio = async (audio: HTMLAudioElement) => {
      audio.pause();
      audio.currentTime = 0;
      audio.muted = false;
      audio.volume = 1;
      await audio.play();
    };

    let audio = ensureAlarmAudioElement(normalizedTone);

    try {
      await playAudio(audio);
      alarmAudioUnlockedRef.current = true;
      pendingAlarmPlaybackRef.current = false;
      pendingAlarmToneRef.current = normalizedTone;
      audioBlockedNoticeShownRef.current = false;
      return true;
    } catch (error) {
      console.warn("Reminder alarm playback failed on the primary audio element.", error);
      const fallbackAudio = createAlarmAudioElement(normalizedTone);
      bindAlarmAudioLifecycle(fallbackAudio);
      alarmAudioRef.current = fallbackAudio;
      alarmToneRef.current = normalizedTone;

      try {
        await playAudio(fallbackAudio);
        alarmAudioUnlockedRef.current = true;
        pendingAlarmPlaybackRef.current = false;
        pendingAlarmToneRef.current = normalizedTone;
        audioBlockedNoticeShownRef.current = false;
        return true;
      } catch (fallbackError) {
        console.warn("Reminder alarm playback failed on the fallback audio element.", fallbackError);
        pendingAlarmPlaybackRef.current = true;
        pendingAlarmToneRef.current = normalizedTone;
        return false;
      }
    }
  }, [bindAlarmAudioLifecycle, ensureAlarmAudioElement]);

  const primeAlarmAudio = useCallback(
    async (tone: ReminderAlarmTone = alarmToneRef.current) => {
      if (typeof window === "undefined") {
        return false;
      }

      const normalizedTone = normalizeReminderTone(tone);
      let audio = ensureAlarmAudioElement(normalizedTone);

      if (!alarmAudioUnlockedRef.current) {
        try {
          alarmPrimingRef.current = true;
          audio.muted = true;
          audio.volume = 0;
          audio.currentTime = 0;
          await audio.play();
          audio.pause();
          audio.currentTime = 0;
          audio.muted = false;
          audio.volume = 1;
          playingAlarmAudioRef.current = null;
          setAlarmActive(false);
          alarmAudioUnlockedRef.current = true;
        } catch (error) {
          console.warn("Reminder alarm priming was blocked before the reminder fired.", error);
          audio.muted = false;
          audio.volume = 1;
          return false;
        } finally {
          alarmPrimingRef.current = false;
        }
      }

      if (pendingAlarmPlaybackRef.current) {
        pendingAlarmPlaybackRef.current = false;
        audioBlockedNoticeShownRef.current = false;
        return playAlarmSound(pendingAlarmToneRef.current);
      }

      return true;
    },
    [ensureAlarmAudioElement, playAlarmSound]
  );

  const stopAlarmSound = useCallback(() => {
    const audio = playingAlarmAudioRef.current || alarmAudioRef.current;

    if (!audio) {
      return;
    }

    pendingAlarmPlaybackRef.current = false;
    audio.pause();
    audio.currentTime = 0;
    playingAlarmAudioRef.current = null;
    setAlarmActive(false);
  }, []);

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
        void playAlarmSound(pendingAlarmToneRef.current).then((didPlay) => {
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

        reminder.reminder_times?.forEach((slot) => {
          const scheduledAt = buildReminderDateTime(now, slot.time);

          if (!scheduledAt) {
            return;
          }

          const reminderTone = normalizeReminderTone(reminder.alarm_tone);
          const reminderTimeLabel = formatReminderTriggerTime(scheduledAt);
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
            `Reminder: ${reminder.medicine_name} is scheduled for ${reminderTimeLabel}. ${
              reminder.instructions || "Please take it as prescribed."
            }`
          );

          void showReminderNotification(`Time for ${reminder.medicine_name}`, {
              body: reminder.instructions || `Scheduled for ${reminderTimeLabel}`,
              tag: reminderKey,
              requireInteraction: true,
            });

          void playAlarmSound(reminderTone).then((didPlay) => {
            if (!didPlay) {
              showAlarmBlockedNotice(
                `Reminder: ${reminder.medicine_name} is scheduled for ${reminderTimeLabel}. Click once in this tab to enable the alarm sound in this browser.`
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
    setDraftTones(
      reminderSuggestions.reduce<Record<string, ReminderAlarmTone>>((result, item) => {
        result[suggestionKey(item)] = DEFAULT_REMINDER_TONE;
        return result;
      }, {})
    );
    setEditingReminderId(null);
    setEditSchedule("");
    setEditTimes("");
    setEditInstructions("");
    setEditTone(DEFAULT_REMINDER_TONE);
    setNotice(null);
  }, [reminderSuggestions]);

  async function createReminder(payload: {
    medicineName: string;
    dosage?: string;
    schedule: string;
    instructions?: string;
    reminderTimes: ReminderTimeSlot[];
    alarmTone: ReminderAlarmTone;
  }) {
    const referenceTime = new Date();
    const scheduleResolution = resolveNextReminderSchedule(referenceTime, payload.reminderTimes);

    if (scheduleResolution.error) {
      setNotice(scheduleResolution.error);
      return;
    }

    await primeAlarmAudio(payload.alarmTone);
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
          alarmTone: payload.alarmTone,
        }),
      });
      await loadReminders();
      setNotice(
        permission === "granted"
          ? nextTriggerAt
            ? `Reminder set. Browser alerts are enabled for ${formatReminderTriggerLabel(
                nextTriggerAt,
                referenceTime
              )}.`
            : "Reminder set. Browser alerts are enabled for the scheduled time."
          : nextTriggerAt
            ? `Reminder set for ${formatReminderTriggerLabel(
                nextTriggerAt,
                referenceTime
              )}. Enable browser notifications if you also want pop-up alerts.`
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
    setEditTone(normalizeReminderTone(reminder.alarm_tone));
    setNotice(null);
  }

  function stopEditing() {
    setEditingReminderId(null);
    setEditSchedule("");
    setEditTimes("");
    setEditInstructions("");
    setEditTone(DEFAULT_REMINDER_TONE);
  }

  async function saveReminderEdits(reminder: MedicineReminderRecord) {
    const parsedReminderTimeInput = parseReminderTimeInput(editTimes);
    const reminderTimes = parsedReminderTimeInput.reminderTimes;

    if (!editSchedule.trim()) {
      setNotice("Schedule is required.");
      return;
    }

    if (
      reminderTimes.length === 0 ||
      parsedReminderTimeInput.invalidEntries.length > 0 ||
      !reminderTimes.every((slot) => isValidTimeSlot(slot.time))
    ) {
      setNotice(REMINDER_TIME_HINT);
      return;
    }

    const referenceTime = new Date();
    const scheduleResolution = resolveNextReminderSchedule(referenceTime, reminderTimes);

    if (scheduleResolution.error) {
      setNotice(scheduleResolution.error);
      return;
    }

    await primeAlarmAudio(editTone);
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
          alarmTone: editTone,
        }),
      });
      await loadReminders();
      stopEditing();
      setNotice(
        nextTriggerAt
          ? `Reminder updated. The next alert is scheduled for ${formatReminderTriggerLabel(
              nextTriggerAt,
              referenceTime
            )}.`
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

      {notice ? (
        <div className="reminder-notice">
          <span>{notice}</span>
          {alarmActive ? (
            <button type="button" className="stop-alarm-button" onClick={stopAlarmSound}>
              Stop
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="reminder-grid">
        <div className="reminder-column">
          <h4>Extracted medicines</h4>
          {reminderSuggestions.length === 0 ? (
            <div className="workspace-addon-empty">
              No medicines were extracted from this report yet.
            </div>
          ) : (
            <div className="reminder-list">
              {reminderSuggestions.map((item) => {
                const itemKey = suggestionKey(item);
                const draftTimeValue = draftTimes[itemKey] || "";
                const draftTone = normalizeReminderTone(draftTones[itemKey]);
                const parsedReminderTimeInput = parseReminderTimeInput(draftTimeValue);

                return (
                  <article key={`${item.medicineName}-${item.schedule}`} className="reminder-card">
                    <strong>{item.medicineName}</strong>
                    <span>{item.dosage || "Dosage not extracted"}</span>
                    <p>{item.schedule}</p>
                    <small>{item.instructions}</small>
                    <label className="field-label">
                      Reminder time(s)
                      <input
                        value={draftTimeValue}
                        onChange={(event) =>
                          setDraftTimes((current) => ({
                            ...current,
                            [itemKey]: event.target.value,
                          }))
                        }
                        placeholder="8:00 AM, 8:00 PM"
                      />
                    </label>
                    <label className="field-label">
                      Alarm tone
                      <select
                        value={draftTone}
                        onChange={(event) =>
                          setDraftTones((current) => ({
                            ...current,
                            [itemKey]: normalizeReminderTone(event.target.value),
                          }))
                        }
                      >
                        {REMINDER_ALARM_TONES.map((tone) => (
                          <option key={tone} value={tone}>
                            {getReminderToneLabel(tone)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      disabled={
                        saving ||
                        !parsedReminderTimeInput.reminderTimes.length ||
                        parsedReminderTimeInput.invalidEntries.length > 0
                      }
                      onClick={() =>
                        createReminder({
                          medicineName: item.medicineName,
                          dosage: item.dosage,
                          schedule: item.schedule,
                          instructions: item.instructions,
                          reminderTimes: parsedReminderTimeInput.reminderTimes,
                          alarmTone: draftTone,
                        })
                      }
                    >
                      Set Reminder
                    </button>
                    <small className="helper-text">
                      Use times like `8:00 AM` or `8:00 PM`. Add multiple times with commas, and
                      the selected tone will play when the alarm triggers.
                    </small>
                  </article>
                );
              })}
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
                          placeholder="8:00 AM, 8:00 PM"
                        />
                      </label>
                      <label className="field-label">
                        Alarm tone
                        <select
                          value={editTone}
                          onChange={(event) => setEditTone(normalizeReminderTone(event.target.value))}
                        >
                          {REMINDER_ALARM_TONES.map((tone) => (
                            <option key={tone} value={tone}>
                              {getReminderToneLabel(tone)}
                            </option>
                          ))}
                        </select>
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
                      <small>Alarm tone: {getReminderToneLabel(reminder.alarm_tone)}</small>
                      <div className="time-pill-row">
                        {reminder.reminder_times.map((slot) => (
                          <span key={`${reminder.id}-${slot.time}`} className="time-pill">
                            {slot.label ? `${slot.label}: ` : ""}
                            {formatStoredReminderClockTime(slot.time)}
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
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }

        .stop-alarm-button {
          border: none;
          border-radius: 999px;
          padding: 9px 14px;
          background: rgba(248, 113, 113, 0.16);
          color: var(--ws-danger);
          font-weight: 700;
          cursor: pointer;
          flex-shrink: 0;
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
        .field-label select,
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
