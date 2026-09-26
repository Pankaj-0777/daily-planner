/* ==========================================================================
   PI SCHEDULER — REACTIVE DAILY PLANNER
   Core Application & Circadian Reactive Schedule Engine
   ========================================================================== */

(function () {
    'use strict';

    /* --------------------------------------------------------------------------
       1. STATE MANAGEMENT & DEFAULTS
       -------------------------------------------------------------------------- */
    const STORAGE_KEY_STATE = 'pi_scheduler_app_state_v1';
    const STORAGE_KEY_STATE_LEGACY = 'anchorflow_app_state_v1';
    const STORAGE_KEY_SETTINGS = 'pi_scheduler_app_settings_v1';
    const STORAGE_KEY_SETTINGS_LEGACY = 'anchorflow_app_settings_v1';

    // Default Circadian Bedrock Routine Anchors
    const defaultAnchors = {
        sleepStart: '23:00', // 11:00 PM (1380 min)
        sleepEnd: '07:00',   // 07:00 AM (420 min)
        breakfast: '08:00',  // 08:00 AM (480 min)
        lunch: '13:00',      // 01:00 PM (780 min)
        dinner: '20:00',     // 08:00 PM (1200 min)
        workoutStart: '17:30', // 05:30 PM (1050 min)
        workoutDuration: 60  // 60 minutes
    };

    let state = {
        anchors: { ...defaultAnchors },
        tasks: [],
        alarms: [],            // Configured mobile & web schedule alarms
        mealPlanConfigured: false,
        activeMealPlan: 'standard3',
        strategy: 'ripple', // 'ripple' | 'least-priority' | 'strict'
        theme: 'dark',
        soundEnabled: true,
        timelineView: 'table', // 'table' | 'fit' | 'active-day' | 'detailed'
        tableFilter: 'all'     // 'all' | 'bedrock' | 'tasks' | 'free'
    };

    /* Helper: Resolve Category Icons & Visual Styling */
    function getEventVisuals(evt) {
        if (evt.type === 'sleep') {
            return { icon: 'fa-solid fa-moon', bgClass: 'segment-sleep', label: 'Sleep Routine' };
        }
        if (evt.type === 'meal') {
            return { icon: 'fa-solid fa-utensils', bgClass: 'segment-meal', label: 'Meal Time' };
        }
        if (evt.type === 'workout') {
            return { icon: 'fa-solid fa-dumbbell', bgClass: 'segment-workout', label: 'Workout Session' };
        }
        if (evt.rigidity === 'hard') {
            return { icon: 'fa-solid fa-lock', bgClass: 'segment-hard', label: 'Fixed Task' };
        }

        const titleLower = (evt.title || '').toLowerCase();
        const cat = evt.originalTask?.category || '';

        if (cat === 'deep-work' || titleLower.includes('code') || titleLower.includes('dev') || titleLower.includes('engineer') || titleLower.includes('system') || titleLower.includes('focus work') || titleLower.includes('deep work')) {
            return { icon: 'fa-solid fa-laptop-code', bgClass: 'segment-flex', label: evt.rigidity === 'relative' ? 'Linked Work' : 'Focus Work' };
        }
        if (cat === 'meeting' || titleLower.includes('meeting') || titleLower.includes('sync') || titleLower.includes('call') || titleLower.includes('executive')) {
            return { icon: 'fa-solid fa-users', bgClass: 'segment-flex', label: evt.rigidity === 'relative' ? 'Linked Sync' : 'Meeting / Calls' };
        }
        if (cat === 'learning' || titleLower.includes('learn') || titleLower.includes('read') || titleLower.includes('study') || titleLower.includes('research')) {
            return { icon: 'fa-solid fa-book-bookmark', bgClass: 'segment-flex', label: evt.rigidity === 'relative' ? 'Linked Learning' : 'Learning Task' };
        }
        if (cat === 'health' || titleLower.includes('post-workout') || titleLower.includes('nutrition') || titleLower.includes('recovery')) {
            return { icon: 'fa-solid fa-heart-pulse', bgClass: 'segment-flex', label: 'Health & Recovery' };
        }

        return {
            icon: evt.rigidity === 'relative' ? 'fa-solid fa-link' : 'fa-solid fa-bolt',
            bgClass: 'segment-flex',
            label: evt.rigidity === 'relative' ? 'Linked Task' : 'Flexible Task'
        };
    }

    /* --------------------------------------------------------------------------
       2. MINUTE-MATH UTILITY ENGINE
       -------------------------------------------------------------------------- */
    const TimeUtil = {
        timeToMinutes(timeStr) {
            if (!timeStr) return 0;
            const [h, m] = timeStr.split(':').map(Number);
            return (h * 60) + m;
        },

        minutesToTime(mins) {
            let m = mins % 1440;
            if (m < 0) m += 1440;
            const hours = Math.floor(m / 60);
            const minutes = m % 60;
            return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        },

        format12H(timeStr) {
            const mins = this.timeToMinutes(timeStr);
            const h24 = Math.floor(mins / 60);
            const m = mins % 60;
            const period = h24 >= 12 ? 'PM' : 'AM';
            const h12 = h24 % 12 || 12;
            return `${h12}:${String(m).padStart(2, '0')} ${period}`;
        }
    };

    /* --------------------------------------------------------------------------
       3. WEB AUDIO PROCEDURAL HARDWARE SOUND SYNTHESIZER
       -------------------------------------------------------------------------- */
    const AudioEngine = {
        ctx: null,
        alarmInterval: null,
        isAlarmLooping: false,

        init() {
            if (!this.ctx) {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (AudioCtx) this.ctx = new AudioCtx();
            }
            if (this.ctx && this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
        },

        playTone(freq = 440, type = 'sine', duration = 0.1, gainVal = 0.05) {
            if (!state.soundEnabled) return;
            this.init();
            if (!this.ctx) return;

            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = type;
            osc.frequency.setValueAtTime(freq, now);

            gain.gain.setValueAtTime(gainVal, now);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(now);
            osc.stop(now + duration);
        },

        playWakeChime() {
            if (!state.soundEnabled) return;
            this.init();
            if (!this.ctx) return;
            const now = this.ctx.currentTime;
            [528, 660, 792, 1056].forEach((freq, idx) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, now + idx * 0.12);
                gain.gain.setValueAtTime(0.1, now + idx * 0.12);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.12 + 0.45);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(now + idx * 0.12);
                osc.stop(now + idx * 0.12 + 0.45);
            });
        },

        playTransitionChime() {
            this.playTone(440, 'triangle', 0.1, 0.06);
            setTimeout(() => this.playTone(880, 'sine', 0.15, 0.06), 100);
        },

        playUrgentAlert() {
            if (!state.soundEnabled) return;
            this.init();
            if (!this.ctx) return;
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(880, now);
            osc.frequency.setValueAtTime(440, now + 0.15);
            osc.frequency.setValueAtTime(880, now + 0.3);
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 0.5);
        },

        playGentleBeep() {
            if (!state.soundEnabled) return;
            this.init();
            if (!this.ctx) return;
            const now = this.ctx.currentTime;
            [440, 554, 659].forEach((freq, idx) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, now + idx * 0.15);
                gain.gain.setValueAtTime(0.06, now + idx * 0.15);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.15 + 0.35);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(now + idx * 0.15);
                osc.stop(now + idx * 0.15 + 0.35);
            });
        },

        playSoundByType(soundType = 'wake-chime') {
            if (soundType === 'wake-chime') this.playWakeChime();
            else if (soundType === 'urgent') this.playUrgentAlert();
            else if (soundType === 'transition') this.playTransitionChime();
            else if (soundType === 'gentle') this.playGentleBeep();
            else this.playWakeChime();
        },

        startAlarmLoop(soundType = 'wake-chime') {
            this.stopAlarmLoop();
            this.isAlarmLooping = true;
            this.playSoundByType(soundType);

            const intervalMs = soundType === 'urgent' ? 1200 : 1800;
            this.alarmInterval = setInterval(() => {
                if (this.isAlarmLooping) {
                    this.playSoundByType(soundType);
                }
            }, intervalMs);
        },

        stopAlarmLoop() {
            this.isAlarmLooping = false;
            if (this.alarmInterval) {
                clearInterval(this.alarmInterval);
                this.alarmInterval = null;
            }
        }
    };

    /* --------------------------------------------------------------------------
       4. CIRCADIAN REACTIVE TIMELINE CALCULATOR ENGINE
       -------------------------------------------------------------------------- */
    const ScheduleEngine = {
        calculateTimeline() {
            // If meal plan / daily schedule is not configured yet, return empty state
            if (!state.mealPlanConfigured) {
                return [];
            }

            const events = [];

            // A. Biological Bedrock Routine Events
            const wakeMins = TimeUtil.timeToMinutes(state.anchors.sleepEnd);
            const sleepMins = TimeUtil.timeToMinutes(state.anchors.sleepStart);

            // Sleep Block (Midnight to Wake) & (Sleep to Midnight)
            if (sleepMins > wakeMins) {
                events.push({
                    id: 'anchor-sleep-morning',
                    title: 'Sleep Routine',
                    type: 'sleep',
                    start: 0,
                    end: wakeMins,
                    rigidity: 'bedrock'
                });
                events.push({
                    id: 'anchor-sleep-night',
                    title: 'Sleep Routine',
                    type: 'sleep',
                    start: sleepMins,
                    end: 1440,
                    rigidity: 'bedrock'
                });
            }

            // Meal Anchors (Standard 3 or Intermittent 2 or Fitness 5)
            if (state.activeMealPlan !== 'custom') {
                if (state.activeMealPlan !== 'intermittent2') {
                    const bMins = TimeUtil.timeToMinutes(state.anchors.breakfast);
                    events.push({ id: 'anchor-breakfast', title: 'Breakfast', type: 'meal', start: bMins, end: bMins + 30, rigidity: 'bedrock' });
                }

                const lMins = TimeUtil.timeToMinutes(state.anchors.lunch);
                events.push({ id: 'anchor-lunch', title: 'Lunch', type: 'meal', start: lMins, end: lMins + 45, rigidity: 'bedrock' });

                const dMins = TimeUtil.timeToMinutes(state.anchors.dinner);
                events.push({ id: 'anchor-dinner', title: 'Dinner', type: 'meal', start: dMins, end: dMins + 45, rigidity: 'bedrock' });

                // Workout Anchor
                const wStart = TimeUtil.timeToMinutes(state.anchors.workoutStart);
                const wEnd = wStart + Number(state.anchors.workoutDuration);
                events.push({ id: 'anchor-workout', title: 'Exercise & Workout', type: 'workout', start: wStart, end: wEnd, rigidity: 'bedrock' });
            }

            // B. Hard Fixed Tasks
            const hardTasks = state.tasks.filter(t => !t.completed && t.rigidity === 'hard');
            hardTasks.forEach(t => {
                const s = TimeUtil.timeToMinutes(t.hardStart);
                const e = TimeUtil.timeToMinutes(t.hardEnd);
                events.push({ id: t.id, title: t.title, type: 'hard', start: s, end: e, rigidity: 'hard', originalTask: t });
            });

            // C. Relative Chained Tasks
            const relativeTasks = state.tasks.filter(t => !t.completed && t.rigidity === 'relative');
            const bMins = TimeUtil.timeToMinutes(state.anchors.breakfast);
            const lMins = TimeUtil.timeToMinutes(state.anchors.lunch);
            const dMins = TimeUtil.timeToMinutes(state.anchors.dinner);
            const wStart = TimeUtil.timeToMinutes(state.anchors.workoutStart);
            const wEnd = wStart + Number(state.anchors.workoutDuration);

            relativeTasks.forEach(t => {
                let baseEnd = wakeMins;
                if (t.relativeTarget === 'breakfast') baseEnd = bMins + 30;
                else if (t.relativeTarget === 'lunch') baseEnd = lMins + 45;
                else if (t.relativeTarget === 'workout') baseEnd = wEnd;
                else if (t.relativeTarget === 'dinner') baseEnd = dMins + 45;

                const start = baseEnd + Number(t.relativeOffset || 0);
                const end = start + Number(t.duration || 30);
                events.push({ id: t.id, title: t.title, type: 'flex', start, end, rigidity: 'relative', originalTask: t });
            });

            // D. Elastic Tasks (Ripple-Shifted into Free Slots)
            const elasticTasks = state.tasks.filter(t => !t.completed && t.rigidity === 'elastic');

            elasticTasks.forEach(t => {
                let prefStart = TimeUtil.timeToMinutes(t.preferredStart || '09:00');
                let dur = Number(t.duration || 60);

                // Find valid free slot using conflict resolution strategy
                let targetStart = prefStart;
                let foundSlot = false;

                // Sort existing events to check collision
                events.sort((a, b) => a.start - b.start);

                for (let time = prefStart; time <= 1440 - dur; time += 15) {
                    const hasConflict = events.some(e => !(time + dur <= e.start || time >= e.end));
                    if (!hasConflict) {
                        targetStart = time;
                        foundSlot = true;
                        break;
                    }
                }

                if (!foundSlot) {
                    // Fallback to post-wake early morning
                    targetStart = wakeMins + 30;
                }

                events.push({
                    id: t.id,
                    title: t.title,
                    type: 'flex',
                    start: targetStart,
                    end: targetStart + dur,
                    rigidity: 'elastic',
                    originalTask: t
                });
            });

            // Sort final timeline by start time
            return events.sort((a, b) => a.start - b.start);
        },

        findFreeSlots(minDurationMins = 30) {
            if (!state.mealPlanConfigured) {
                return [];
            }

            const events = this.calculateTimeline();
            const freeSlots = [];
            const wakeMins = TimeUtil.timeToMinutes(state.anchors.sleepEnd);
            const sleepMins = TimeUtil.timeToMinutes(state.anchors.sleepStart);

            let cursor = wakeMins;

            events.forEach(e => {
                if (e.start > cursor) {
                    const gap = e.start - cursor;
                    if (gap >= minDurationMins && cursor >= wakeMins && e.start <= sleepMins) {
                        freeSlots.push({
                            start: cursor,
                            end: e.start,
                            duration: gap
                        });
                    }
                }
                if (e.end > cursor) {
                    cursor = e.end;
                }
            });

            if (sleepMins > cursor) {
                const gap = sleepMins - cursor;
                if (gap >= minDurationMins) {
                    freeSlots.push({
                        start: cursor,
                        end: sleepMins,
                        duration: gap
                    });
                }
            }

            return freeSlots;
        }
    };

    /* --------------------------------------------------------------------------
       5. MOBILE & WEB ALARM ENGINE (RECURRING SCHEDULES & HARDWARE SYNC)
       -------------------------------------------------------------------------- */
    const AlarmEngine = {
        currentRingingAlarm: null,
        wakeLockSentinel: null,
        vibrateInterval: null,
        lastTriggeredMinute: '',

        init() {
            this.renderAlarmsList();
        },

        checkAlarms() {
            const now = new Date();
            const h = String(now.getHours()).padStart(2, '0');
            const m = String(now.getMinutes()).padStart(2, '0');
            const s = now.getSeconds();
            const currentTimeKey = `${h}:${m}`;
            const currentDay = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat

            // Live update the ringing screen time if it is currently open
            if (this.currentRingingAlarm) {
                const ringingTimeEl = document.getElementById('ringingTimeDisplay');
                const ringingDateEl = document.getElementById('ringingDateDisplay');
                if (ringingTimeEl) {
                    ringingTimeEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                }
                if (ringingDateEl) {
                    ringingDateEl.textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
                }
            }

            // Trigger only once per minute
            const minuteKey = `${currentTimeKey}-${currentDay}`;
            if (this.lastTriggeredMinute === minuteKey) return;

            if (!state.alarms || state.alarms.length === 0) return;

            state.alarms.forEach(alarm => {
                if (!alarm.enabled) return;
                const alarmDays = alarm.days || [1, 2, 3, 4, 5];
                if (!alarmDays.includes(currentDay)) return;

                if (alarm.time === currentTimeKey) {
                    this.lastTriggeredMinute = minuteKey;
                    this.triggerAlarm(alarm);
                }
            });
        },

        triggerAlarm(alarm) {
            this.currentRingingAlarm = alarm;

            // 1. Start continuous looping Web Audio synthesizer
            AudioEngine.startAlarmLoop(alarm.sound || 'wake-chime');

            // 2. Hardware vibration pattern (continuous loop)
            if (alarm.vibrate !== false && 'vibrate' in navigator) {
                try {
                    navigator.vibrate([600, 300, 600, 300, 600, 300, 1000]);
                    if (this.vibrateInterval) clearInterval(this.vibrateInterval);
                    this.vibrateInterval = setInterval(() => {
                        if (this.currentRingingAlarm) {
                            navigator.vibrate([600, 300, 600, 300, 600, 300, 1000]);
                        }
                    }, 3500);
                } catch (e) {
                    console.warn('Vibration API error:', e);
                }
            }

            // 3. Request Screen Wake Lock
            if ('wakeLock' in navigator) {
                try {
                    navigator.wakeLock.request('screen').then(lock => {
                        this.wakeLockSentinel = lock;
                    }).catch(err => console.log('Wake Lock request:', err));
                } catch (e) {}
            }

            // 4. Web Notification
            if ('Notification' in window && Notification.permission === 'granted') {
                try {
                    new Notification(`🔔 Alarm: ${alarm.title}`, {
                        body: `Scheduled alarm for ${TimeUtil.format12H(alarm.time)} (${alarm.days && alarm.days.length === 5 ? 'Weekdays' : 'Schedule'})`,
                        icon: './icons/icon-192.png',
                        vibrate: [500, 250, 500, 250, 500],
                        requireInteraction: true
                    });
                } catch (e) {}
            }

            // 5. Full-Screen Ringing Overlay
            const overlay = document.getElementById('alarmRingingOverlay');
            if (overlay) {
                const timeEl = document.getElementById('ringingTimeDisplay');
                const dateEl = document.getElementById('ringingDateDisplay');
                const titleEl = document.getElementById('ringingEventTitle');
                const catEl = document.getElementById('ringingCategoryChip');
                const subEl = document.getElementById('ringingEventSub');

                const now = new Date();
                if (timeEl) timeEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                if (dateEl) dateEl.textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
                if (titleEl) titleEl.textContent = alarm.title;
                if (catEl) catEl.textContent = alarm.type ? (alarm.type.toUpperCase() + ' ALARM') : 'SCHEDULE ALARM';
                if (subEl) subEl.textContent = `Scheduled at ${TimeUtil.format12H(alarm.time)}`;

                overlay.hidden = false;
            }
        },

        dismissAlarm() {
            AudioEngine.stopAlarmLoop();

            if (this.vibrateInterval) {
                clearInterval(this.vibrateInterval);
                this.vibrateInterval = null;
            }
            if ('vibrate' in navigator) {
                try { navigator.vibrate(0); } catch (e) {}
            }

            if (this.wakeLockSentinel) {
                this.wakeLockSentinel.release().catch(() => {});
                this.wakeLockSentinel = null;
            }

            const overlay = document.getElementById('alarmRingingOverlay');
            if (overlay) overlay.hidden = true;

            // If one-shot snooze alarm, remove it
            if (this.currentRingingAlarm && this.currentRingingAlarm.isOneShot) {
                state.alarms = state.alarms.filter(a => a.id !== this.currentRingingAlarm.id);
                UI.saveAndRefresh();
            }

            if (this.currentRingingAlarm) {
                showToast(`✅ Dismissed alarm: ${this.currentRingingAlarm.title}`);
            }
            this.currentRingingAlarm = null;
        },

        snoozeAlarm(minutes = 5) {
            if (!this.currentRingingAlarm) {
                this.dismissAlarm();
                return;
            }

            const originalAlarm = { ...this.currentRingingAlarm };
            this.dismissAlarm();

            const now = new Date();
            now.setMinutes(now.getMinutes() + minutes);
            const snoozeH = String(now.getHours()).padStart(2, '0');
            const snoozeM = String(now.getMinutes()).padStart(2, '0');
            const snoozeTimeStr = `${snoozeH}:${snoozeM}`;

            const snoozeAlarm = {
                id: `snooze-${Date.now()}`,
                title: `(Snooze) ${originalAlarm.title}`,
                time: snoozeTimeStr,
                sound: originalAlarm.sound || 'wake-chime',
                vibrate: originalAlarm.vibrate !== false,
                days: [0, 1, 2, 3, 4, 5, 6],
                enabled: true,
                isOneShot: true,
                type: 'snooze'
            };

            state.alarms.push(snoozeAlarm);
            UI.saveAndRefresh();
            showToast(`💤 Snoozed for ${minutes} mins (rings at ${TimeUtil.format12H(snoozeTimeStr)})`);
        },

        triggerNativeDeviceAlarm(alarm) {
            const [hStr, mStr] = alarm.time.split(':');
            const h = parseInt(hStr, 10);
            const m = parseInt(mStr, 10);
            const msg = encodeURIComponent(alarm.title || 'Daily Alarm');

            // Android Clock SET_ALARM Intent
            const intentUri = `intent:#Intent;action=android.intent.action.SET_ALARM;i.android.intent.extra.hour=${h};i.android.intent.extra.minutes=${m};S.android.intent.extra.message=${msg};B.android.intent.extra.skip_ui=false;end`;

            const link = document.createElement('a');
            link.href = intentUri;
            document.body.appendChild(link);
            try {
                link.click();
            } catch (e) {
                console.warn('Native alarm intent dispatch:', e);
            }
            document.body.removeChild(link);
        },

        promptAlarmSetup(title, time, sourceId = null, type = 'task') {
            const overlay = document.getElementById('alarmPromptModalOverlay');
            if (!overlay) return;

            document.getElementById('alarmSourceId').value = sourceId || '';
            document.getElementById('alarmSourceType').value = type;
            document.getElementById('alarmExistingId').value = '';

            // Check if an alarm already exists for this sourceId
            if (sourceId) {
                const existing = state.alarms.find(a => a.sourceId === sourceId);
                if (existing) {
                    document.getElementById('alarmExistingId').value = existing.id;
                }
            }

            document.getElementById('alarmModalTitleDisplay').textContent = title;
            document.getElementById('alarmModalTimeDisplay').textContent = TimeUtil.format12H(time);

            const typeBadge = document.getElementById('alarmModalTypeBadge');
            if (typeBadge) {
                if (type === 'wake') typeBadge.innerHTML = `<i class="fa-solid fa-sun"></i> Wake-Up Anchor`;
                else if (type === 'bedrock') typeBadge.innerHTML = `<i class="fa-solid fa-dna"></i> Routine Anchor`;
                else if (type === 'priority') typeBadge.innerHTML = `<i class="fa-solid fa-bolt text-rose"></i> High Priority Task`;
                else if (type === 'hard') typeBadge.innerHTML = `<i class="fa-solid fa-lock text-cyan"></i> Fixed Time Task`;
                else typeBadge.innerHTML = `<i class="fa-solid fa-bell"></i> Schedule Event`;
            }

            document.getElementById('alarmCustomTitleInput').value = title;
            document.getElementById('alarmCustomTimeInput').value = time;

            // Default Recurrence: 5 Weekdays (Mon-Fri)
            this.setRecurrencePreset('weekdays');

            overlay.hidden = false;
        },

        setRecurrencePreset(preset) {
            document.querySelectorAll('.recurrence-pill').forEach(p => {
                p.classList.toggle('active', p.dataset.preset === preset);
            });

            const chips = document.querySelectorAll('#customDaysSelector .day-chip');
            let activeDays = [];
            if (preset === 'weekdays') activeDays = [1, 2, 3, 4, 5]; // Mon-Fri
            else if (preset === 'everyday') activeDays = [0, 1, 2, 3, 4, 5, 6]; // Sun-Sat
            else if (preset === 'weekends') activeDays = [6, 0]; // Sat-Sun
            else activeDays = [1, 2, 3, 4, 5]; // Custom

            chips.forEach(chip => {
                const dayVal = parseInt(chip.dataset.day, 10);
                const isSelected = activeDays.includes(dayVal);
                chip.classList.toggle('selected', isSelected);
                const input = chip.querySelector('input');
                if (input) input.checked = isSelected;
            });
        },

        getSelectedDays() {
            const selected = [];
            document.querySelectorAll('#customDaysSelector .day-chip input:checked').forEach(input => {
                selected.push(parseInt(input.value, 10));
            });
            return selected.length > 0 ? selected : [1, 2, 3, 4, 5];
        },

        formatDaysSummary(days) {
            if (!days || days.length === 0) return 'No days';
            if (days.length === 7) return 'Everyday (7 Days)';
            const sorted = [...days].sort((a, b) => a - b);
            const isWeekdays = sorted.length === 5 && [1, 2, 3, 4, 5].every(d => sorted.includes(d));
            if (isWeekdays) return 'Mon–Fri (5 Days)';
            const isWeekends = sorted.length === 2 && [0, 6].every(d => sorted.includes(d));
            if (isWeekends) return 'Weekends (Sat–Sun)';

            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            return sorted.map(d => dayNames[d]).join(', ');
        },

        saveAlarmFromModal() {
            const title = document.getElementById('alarmCustomTitleInput').value.trim() || 'Scheduled Alarm';
            const time = document.getElementById('alarmCustomTimeInput').value || '07:00';
            const sound = document.getElementById('alarmSoundSelect').value || 'wake-chime';
            const vibrate = document.getElementById('alarmVibrateToggle').checked;
            const setNative = document.getElementById('alarmNativeClockToggle').checked;
            const sourceId = document.getElementById('alarmSourceId').value || null;
            const sourceType = document.getElementById('alarmSourceType').value || 'task';
            const existingId = document.getElementById('alarmExistingId').value;
            const days = this.getSelectedDays();

            // Request notification permission if still default
            if ('Notification' in window && Notification.permission === 'default') {
                try { Notification.requestPermission(); } catch (e) {}
            }

            const alarmId = existingId || (sourceId ? `alarm-${sourceId}` : `alarm-${Date.now()}`);

            const newAlarm = {
                id: alarmId,
                title,
                time,
                sound,
                vibrate,
                days,
                enabled: true,
                type: sourceType,
                sourceId: sourceId || null
            };

            const idx = state.alarms.findIndex(a => a.id === alarmId || (sourceId && a.sourceId === sourceId));
            if (idx >= 0) {
                state.alarms[idx] = newAlarm;
            } else {
                state.alarms.push(newAlarm);
            }

            if (setNative) {
                this.triggerNativeDeviceAlarm(newAlarm);
            }

            document.getElementById('alarmPromptModalOverlay').hidden = true;
            UI.saveAndRefresh();
            showToast(`⏰ Alarm saved for "${title}" at ${TimeUtil.format12H(time)} (${this.formatDaysSummary(days)})!`);
        },

        renderAlarmsList() {
            const container = document.getElementById('activeAlarmsList');
            if (!container) return;

            if (!state.alarms || state.alarms.length === 0) {
                container.innerHTML = `
                    <div class="no-alarms-empty">
                        <i class="fa-solid fa-bell-slash"></i>
                        <p>No alarms configured yet. Alarms prompt automatically when setting wake-up routines or high-priority tasks.</p>
                        <button class="btn btn-secondary btn-sm" onclick="window.PiScheduler.openCustomAlarmPrompt();" style="margin-top:0.75rem;">
                            <i class="fa-solid fa-plus"></i> Set Your First Alarm
                        </button>
                    </div>
                `;
                return;
            }

            container.innerHTML = '';
            state.alarms.forEach(alarm => {
                const card = document.createElement('div');
                card.className = `alarm-item-card ${alarm.enabled ? 'active' : 'disabled'}`;
                const daysSummary = this.formatDaysSummary(alarm.days);
                const soundLabels = {
                    'wake-chime': 'Wake Chime',
                    'urgent': 'Urgent Siren',
                    'transition': 'Focus Tone',
                    'gentle': 'Gentle Beep'
                };

                card.innerHTML = `
                    <div class="alarm-item-left">
                        <div class="alarm-item-time">${TimeUtil.format12H(alarm.time)}</div>
                        <div class="alarm-item-meta">
                            <span class="alarm-item-title">${alarm.title}</span>
                            <div class="alarm-item-badges">
                                <span class="alarm-day-pill"><i class="fa-solid fa-repeat"></i> ${daysSummary}</span>
                                <span class="alarm-sound-pill"><i class="fa-solid fa-music"></i> ${soundLabels[alarm.sound] || 'Chime'}</span>
                                ${alarm.vibrate !== false ? '<span class="alarm-vib-pill"><i class="fa-solid fa-mobile-screen-button"></i> Vib</span>' : ''}
                            </div>
                        </div>
                    </div>
                    <div class="alarm-item-right">
                        <button class="btn-icon btn-sm test-alarm-btn" title="Test Alarm Ring" data-id="${alarm.id}">
                            <i class="fa-solid fa-play"></i>
                        </button>
                        <label class="switch-toggle" title="Enable/Disable Alarm">
                            <input type="checkbox" class="toggle-alarm-input" data-id="${alarm.id}" ${alarm.enabled ? 'checked' : ''}>
                            <span class="slider round"></span>
                        </label>
                        <button class="btn-icon btn-sm delete-alarm-btn" title="Delete Alarm" data-id="${alarm.id}">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                `;

                // Event listeners
                card.querySelector('.test-alarm-btn').addEventListener('click', () => {
                    this.triggerAlarm(alarm);
                });

                card.querySelector('.toggle-alarm-input').addEventListener('change', (e) => {
                    alarm.enabled = e.target.checked;
                    card.classList.toggle('active', alarm.enabled);
                    card.classList.toggle('disabled', !alarm.enabled);
                    UI.saveAndRefresh();
                    showToast(`Alarm ${alarm.enabled ? 'enabled' : 'disabled'}: ${alarm.title}`);
                });

                card.querySelector('.delete-alarm-btn').addEventListener('click', () => {
                    state.alarms = state.alarms.filter(a => a.id !== alarm.id);
                    UI.saveAndRefresh();
                    showToast(`Alarm deleted: ${alarm.title}`);
                });

                container.appendChild(card);
            });
        }
    };

    /* --------------------------------------------------------------------------
       6. DOM RENDERING & VIEW CONTROLLERS
       -------------------------------------------------------------------------- */
    const UI = {
        init() {
            this.syncViewSwitcher();
            this.renderTimelineRuler();
            this.renderAll();
            this.bindEvents();
            this.startLiveClock();
        },

        syncViewSwitcher() {
            const currentView = state.timelineView || 'table';
            document.querySelectorAll('#timelineViewSwitcher .view-pill').forEach(pill => {
                if (pill.dataset.view === currentView) {
                    pill.classList.add('active');
                } else {
                    pill.classList.remove('active');
                }
            });
        },

        renderAll() {
            this.checkEmptyScheduleState();
            this.renderTimelineRuler();
            this.renderTimelineTrack();
            this.renderScheduleTable();
            this.renderTasksList();
            this.updateMetrics();
            this.syncAnchorInputs();
            AlarmEngine.renderAlarmsList();
        },

        checkEmptyScheduleState() {
            const emptyBanner = document.getElementById('emptyScheduleBanner');
            if (!emptyBanner) return;
            if (!state.mealPlanConfigured) {
                emptyBanner.style.display = 'block';
            } else {
                emptyBanner.style.display = 'none';
            }
        },

        renderTimelineRuler() {
            const ruler = document.getElementById('timelineRuler');
            if (!ruler) return;
            ruler.innerHTML = '';

            const view = state.timelineView || 'table';

            if (view === 'active-day') {
                // 06:00 to 23:00 (every 1 hour)
                for (let h = 6; h <= 23; h++) {
                    const tick = document.createElement('span');
                    tick.className = 'ruler-tick';
                    tick.textContent = `${String(h).padStart(2, '0')}:00`;
                    ruler.appendChild(tick);
                }
            } else if (view === 'detailed') {
                // 00:00 to 24:00 (every 1 hour)
                for (let h = 0; h <= 24; h++) {
                    const tick = document.createElement('span');
                    tick.className = 'ruler-tick';
                    tick.textContent = `${String(h).padStart(2, '0')}:00`;
                    ruler.appendChild(tick);
                }
            } else {
                // 'fit' or default 00:00 to 24:00 (every 2 hours)
                for (let h = 0; h <= 24; h += 2) {
                    const tick = document.createElement('span');
                    tick.className = 'ruler-tick';
                    tick.textContent = `${String(h).padStart(2, '0')}:00`;
                    ruler.appendChild(tick);
                }
            }
        },

        renderTimelineTrack() {
            const container = document.getElementById('timelineTrackContainer');
            const track = document.getElementById('timelineVisualTrack');
            const tableSection = document.getElementById('timelineScheduleTableView');
            const tooltip = document.getElementById('timelineTooltip');
            if (!track) return;

            const currentView = state.timelineView || 'table';

            // Handle container modes and visibility
            if (container) {
                container.classList.remove('view-detailed', 'view-active-day');
                if (currentView === 'detailed') {
                    container.classList.add('view-detailed');
                } else if (currentView === 'active-day') {
                    container.classList.add('view-active-day');
                }

                if (currentView === 'table') {
                    container.style.display = 'none';
                    if (tableSection) tableSection.style.display = 'block';
                } else {
                    container.style.display = 'block';
                    if (tableSection) tableSection.style.display = 'none';
                }
            }

            // Preserve Now cursor
            const nowCursor = document.getElementById('timelineNowCursor');
            track.innerHTML = '';
            if (nowCursor) track.appendChild(nowCursor);

            // If not configured yet, don't plot segments
            if (!state.mealPlanConfigured) {
                if (nowCursor) nowCursor.style.display = 'none';
                return;
            }

            const timelineEvents = ScheduleEngine.calculateTimeline();

            // Compute bounds based on active view mode
            let startBound = 0;
            let endBound = 1440;
            let totalMins = 1440;

            if (currentView === 'active-day') {
                startBound = 360;  // 06:00
                endBound = 1380;   // 23:00
                totalMins = endBound - startBound; // 1020 mins
            }

            timelineEvents.forEach(evt => {
                // Skip events completely outside active-day window
                if (currentView === 'active-day' && (evt.end <= startBound || evt.start >= endBound)) {
                    return;
                }

                // Clamp for active-day view
                const effectiveStart = Math.max(evt.start, startBound);
                const effectiveEnd = Math.min(evt.end, endBound);
                const dur = effectiveEnd - effectiveStart;
                if (dur <= 0) return;

                const leftPercent = ((effectiveStart - startBound) / totalMins) * 100;
                const widthPercent = (dur / totalMins) * 100;

                const seg = document.createElement('div');
                const visuals = getEventVisuals(evt);

                seg.className = `timeline-segment ${visuals.bgClass}`;
                seg.style.left = `${leftPercent}%`;
                seg.style.width = `${Math.max(widthPercent, 0.6)}%`;

                const timeStr = `${TimeUtil.format12H(TimeUtil.minutesToTime(evt.start))} – ${TimeUtil.format12H(TimeUtil.minutesToTime(evt.end))}`;
                const durStr = `${evt.end - evt.start}m`;

                seg.innerHTML = `
                    <div class="segment-inner">
                        <span class="segment-icon"><i class="${visuals.icon}"></i></span>
                        <span class="segment-title">${evt.title}</span>
                        <span class="segment-time-badge">${timeStr}</span>
                    </div>
                `;

                // Interactive hover popover tooltip
                const updateTooltipPos = (clientX, clientY) => {
                    if (!tooltip) return;
                    tooltip.style.display = 'block';
                    tooltip.style.opacity = '1';

                    const tw = tooltip.offsetWidth || 250;
                    const th = tooltip.offsetHeight || 115;

                    let x = clientX;
                    let y = clientY - 14;
                    let transformY = '-100%';

                    // Vertical boundary check: Flip below cursor if near top of window
                    if (y - th < 15) {
                        y = clientY + 24;
                        transformY = '0%';
                    }

                    // Horizontal boundary clamp: Keep inside viewport
                    const halfWidth = tw / 2;
                    if (x - halfWidth < 12) {
                        x = halfWidth + 12;
                    } else if (x + halfWidth > window.innerWidth - 12) {
                        x = window.innerWidth - halfWidth - 12;
                    }

                    tooltip.style.left = `${x}px`;
                    tooltip.style.top = `${y}px`;
                    tooltip.style.transform = `translate(-50%, ${transformY})`;
                };

                seg.addEventListener('mouseenter', (e) => {
                    if (tooltip) {
                        const badgeClass = `badge-${evt.rigidity || 'elastic'}`;
                        const now = new Date();
                        const nowMins = (now.getHours() * 60) + now.getMinutes();
                        const isNow = (nowMins >= evt.start && nowMins < evt.end);
                        const nowIndicator = isNow ? `<span class="table-status-badge status-now" style="padding:1px 6px; font-size:0.68rem;"><span class="pulse-dot" style="width:5px;height:5px;"></span> Active Now</span>` : '';

                        let iconBgColor = 'rgba(91, 139, 245, 0.15)';
                        let iconColor = 'var(--accent-indigo)';
                        if (evt.type === 'sleep') { iconBgColor = 'rgba(91, 139, 245, 0.20)'; iconColor = 'var(--accent-indigo)'; }
                        else if (evt.type === 'meal') { iconBgColor = 'rgba(52, 211, 153, 0.20)'; iconColor = 'var(--accent-emerald)'; }
                        else if (evt.type === 'workout') { iconBgColor = 'rgba(251, 191, 36, 0.20)'; iconColor = 'var(--accent-amber)'; }
                        else if (evt.rigidity === 'hard') { iconBgColor = 'rgba(251, 113, 133, 0.20)'; iconColor = 'var(--accent-rose)'; }

                        const badgeLabels = {
                            'hard': 'Fixed Time',
                            'relative': 'Linked Task',
                            'elastic': 'Flexible Time',
                            'bedrock': 'Daily Routine'
                        };
                        const displayBadge = badgeLabels[evt.rigidity] || evt.rigidity || 'Flexible Time';

                        tooltip.innerHTML = `
                            <div class="tooltip-header">
                                <span class="tooltip-icon-badge" style="background:${iconBgColor}; color:${iconColor};">
                                    <i class="${visuals.icon}"></i>
                                </span>
                                <div style="flex:1; overflow:hidden;">
                                    <div class="tooltip-title">${evt.title}</div>
                                </div>
                                ${nowIndicator}
                            </div>
                            <div class="tooltip-meta">
                                <span class="tooltip-time"><i class="fa-regular fa-clock"></i> ${timeStr}</span>
                                <span class="tooltip-dur">${durStr}</span>
                            </div>
                            <div class="tooltip-footer">
                                <span class="task-badge-rigidity ${badgeClass}">${displayBadge}</span>
                                <span class="tooltip-category-text">${visuals.label}</span>
                            </div>
                        `;

                        updateTooltipPos(e.clientX, e.clientY);
                    }
                });

                seg.addEventListener('mousemove', (e) => {
                    updateTooltipPos(e.clientX, e.clientY);
                });

                seg.addEventListener('mouseleave', () => {
                    if (tooltip) {
                        tooltip.style.opacity = '0';
                        setTimeout(() => {
                            if (tooltip.style.opacity === '0') {
                                tooltip.style.display = 'none';
                            }
                        }, 120);
                    }
                });

                seg.addEventListener('click', () => {
                    AudioEngine.playTone(600, 'sine', 0.08);
                    showToast(`📍 ${evt.title} [${timeStr}]`);
                });

                track.appendChild(seg);
            });

            this.updateNowCursor();
        },

        renderScheduleTable() {
            const tbody = document.getElementById('scheduleTableBody');
            if (!tbody) return;
            tbody.innerHTML = '';

            // If not configured yet, show empty initial onboarding banner in table
            if (!state.mealPlanConfigured) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="6" style="text-align:center; padding:3rem 1.5rem; color:var(--text-muted);">
                            <div style="display:flex; flex-direction:column; align-items:center; gap:0.75rem;">
                                <div style="width:48px; height:48px; border-radius:50%; background:rgba(99,102,241,0.12); color:var(--accent-indigo); display:flex; align-items:center; justify-content:center; font-size:1.4rem;">
                                    <i class="fa-solid fa-calendar-plus"></i>
                                </div>
                                <div style="font-size:1.05rem; font-weight:700; color:var(--text-primary);">No Schedule Configured Yet</div>
                                <p style="max-width:420px; font-size:0.85rem; margin:0; line-height:1.5;">Click <strong>"Start New Schedule"</strong> above or below to choose your meal plan and circadian routine.</p>
                                <button class="btn btn-primary btn-sm" onclick="window.PiScheduler.openWizardModal()" style="margin-top:0.25rem;">
                                    <i class="fa-solid fa-wand-magic-sparkles"></i> Start New Schedule
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
                return;
            }

            const filter = state.tableFilter || 'all';
            const timelineEvents = ScheduleEngine.calculateTimeline();
            const freeSlots = ScheduleEngine.findFreeSlots();

            let tableItems = [];

            // Add scheduled events
            timelineEvents.forEach(evt => {
                const visuals = getEventVisuals(evt);
                tableItems.push({
                    id: evt.id,
                    title: evt.title,
                    start: evt.start,
                    end: evt.end,
                    duration: evt.end - evt.start,
                    type: evt.type,
                    rigidity: evt.rigidity,
                    icon: visuals.icon,
                    categoryLabel: visuals.label,
                    isFree: false
                });
            });

            // Add free slots if relevant
            if (filter === 'all' || filter === 'free') {
                freeSlots.forEach((slot, idx) => {
                    tableItems.push({
                        id: `free-slot-${idx}`,
                        title: 'Free Time Slot',
                        start: slot.start,
                        end: slot.end,
                        duration: slot.duration,
                        type: 'free',
                        rigidity: 'flexible',
                        icon: 'fa-regular fa-compass',
                        categoryLabel: 'Available Free Time',
                        isFree: true
                    });
                });
            }

            // Chronological sort
            tableItems.sort((a, b) => a.start - b.start);

            // Apply Filter
            if (filter === 'bedrock') {
                tableItems = tableItems.filter(item => item.rigidity === 'bedrock');
            } else if (filter === 'tasks') {
                tableItems = tableItems.filter(item => item.rigidity !== 'bedrock' && !item.isFree);
            } else if (filter === 'free') {
                tableItems = tableItems.filter(item => item.isFree);
            }

            if (tableItems.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:2rem; color:var(--text-muted);">No schedule items match the selected filter.</td></tr>`;
                return;
            }

            const now = new Date();
            const nowMins = (now.getHours() * 60) + now.getMinutes();

            const rigidityLabels = {
                'bedrock': 'Fixed Routine',
                'hard': 'Fixed Time',
                'relative': 'Linked Task',
                'elastic': 'Flexible Time',
                'flexible': 'Free Time'
            };

            tableItems.forEach(item => {
                const tr = document.createElement('tr');
                const timeStr = `${TimeUtil.format12H(TimeUtil.minutesToTime(item.start))} – ${TimeUtil.format12H(TimeUtil.minutesToTime(item.end))}`;
                const durStr = `${item.duration} min`;
                const startTimeStr = TimeUtil.minutesToTime(item.start);

                let statusBadge = '';
                if (item.isFree) {
                    statusBadge = `<span class="table-status-badge status-upcoming" style="color:var(--accent-emerald); background:rgba(52,211,153,0.08);"><i class="fa-solid fa-bolt"></i> Ready</span>`;
                } else if (nowMins >= item.start && nowMins < item.end) {
                    statusBadge = `<span class="table-status-badge status-now"><span class="pulse-dot" style="width:6px;height:6px;"></span> Active Now</span>`;
                    tr.style.background = 'rgba(251, 113, 133, 0.05)';
                } else if (nowMins >= item.end) {
                    statusBadge = `<span class="table-status-badge status-completed"><i class="fa-solid fa-check"></i> Passed</span>`;
                } else {
                    statusBadge = `<span class="table-status-badge status-upcoming"><i class="fa-regular fa-clock"></i> Upcoming</span>`;
                }

                let rigidityBadgeClass = item.isFree ? 'badge-elastic' : `badge-${item.rigidity}`;

                let iconBgColor = 'rgba(91, 139, 245, 0.12)';
                let iconColor = 'var(--accent-indigo)';
                if (item.type === 'sleep') { iconBgColor = 'rgba(91, 139, 245, 0.15)'; iconColor = 'var(--accent-indigo)'; }
                else if (item.type === 'meal') { iconBgColor = 'rgba(52, 211, 153, 0.15)'; iconColor = 'var(--accent-emerald)'; }
                else if (item.type === 'workout') { iconBgColor = 'rgba(251, 191, 36, 0.15)'; iconColor = 'var(--accent-amber)'; }
                else if (item.rigidity === 'hard') { iconBgColor = 'rgba(251, 113, 133, 0.15)'; iconColor = 'var(--accent-rose)'; }
                else if (item.isFree) { iconBgColor = 'rgba(52, 211, 153, 0.10)'; iconColor = 'var(--accent-emerald)'; }

                const displayRigidity = rigidityLabels[item.rigidity] || item.rigidity || 'Flexible Time';

                // Check if alarm is set for this item
                const isAlarmSet = !item.isFree && state.alarms && state.alarms.some(a => (a.sourceId === item.id || a.time === startTimeStr) && a.enabled);

                const alarmCellContent = item.isFree ? `<span style="color:var(--text-muted); font-size:0.75rem;">—</span>` : `
                    <button class="btn-icon btn-sm table-alarm-btn ${isAlarmSet ? 'alarm-set' : ''}" title="${isAlarmSet ? 'Alarm Active (Click to edit)' : 'Set alarm for this event'}" data-title="${item.title}" data-time="${startTimeStr}" data-source="${item.id}" data-type="${item.rigidity}">
                        <i class="fa-${isAlarmSet ? 'solid' : 'regular'} fa-bell" style="${isAlarmSet ? 'color:var(--accent-amber);' : ''}"></i>
                    </button>
                `;

                tr.innerHTML = `
                    <td class="table-time-cell">${timeStr}</td>
                    <td class="table-duration-cell">${durStr}</td>
                    <td>
                        <div class="table-event-cell">
                            <span class="table-event-icon" style="background:${iconBgColor}; color:${iconColor};">
                                <i class="${item.icon}"></i>
                            </span>
                            <div>
                                <div style="font-weight:600; color:var(--text-primary);">${item.title}</div>
                                <div style="font-size:0.72rem; color:var(--text-muted);">${item.categoryLabel}</div>
                            </div>
                        </div>
                    </td>
                    <td>
                        <span class="task-badge-rigidity ${rigidityBadgeClass}">${displayRigidity}</span>
                    </td>
                    <td>${statusBadge}</td>
                    <td>${alarmCellContent}</td>
                `;

                const alarmBtn = tr.querySelector('.table-alarm-btn');
                if (alarmBtn) {
                    alarmBtn.addEventListener('click', () => {
                        const t = alarmBtn.dataset.title;
                        const tm = alarmBtn.dataset.time;
                        const src = alarmBtn.dataset.source;
                        const typ = alarmBtn.dataset.type;
                        AlarmEngine.promptAlarmSetup(t, tm, src, typ);
                    });
                }

                tbody.appendChild(tr);
            });
                    </td>
                    <td>${statusBadge}</td>
                `;

                tbody.appendChild(tr);
            });
        },

        renderTasksList() {
            const list = document.getElementById('tasksStreamList');
            if (!list) return;
            list.innerHTML = '';

            if (state.tasks.length === 0) {
                list.innerHTML = `<div class="empty-state" style="text-align:center; padding:2rem; color:var(--text-muted);">
                    <i class="fa-solid fa-list-check" style="font-size:2rem; margin-bottom:0.5rem;"></i>
                    <p>No active tasks yet. Click "+ Add Task" to add one.</p>
                </div>`;
                return;
            }

            const rigidityLabels = {
                'hard': 'Fixed Time',
                'relative': 'Linked Task',
                'elastic': 'Flexible Time'
            };

            state.tasks.forEach(task => {
                const card = document.createElement('div');
                card.className = `task-item-card task-${task.rigidity} ${task.completed ? 'completed' : ''}`;

                let badgeClass = `badge-${task.rigidity}`;
                let timeSubtitle = '';
                if (task.rigidity === 'hard') timeSubtitle = `${TimeUtil.format12H(task.hardStart)} - ${TimeUtil.format12H(task.hardEnd)}`;
                else if (task.rigidity === 'elastic') timeSubtitle = `${task.duration}m duration (Preferred: ${TimeUtil.format12H(task.preferredStart)})`;
                else timeSubtitle = `+${task.relativeOffset}m after ${task.relativeTarget}`;

                const displayRigidity = rigidityLabels[task.rigidity] || task.rigidity;

                card.innerHTML = `
                    <div class="task-item-left">
                        <button class="task-check-btn" aria-label="Toggle Complete">
                            <i class="fa-solid fa-check"></i>
                        </button>
                        <div class="task-details">
                            <span class="task-title">${task.title}</span>
                            <div class="task-meta">
                                <span class="task-badge-rigidity ${badgeClass}">${displayRigidity}</span>
                                <span><i class="fa-regular fa-clock"></i> ${timeSubtitle}</span>
                            </div>
                        </div>
                    </div>
                    <div class="task-item-actions">
                        <button class="icon-btn btn-sm delete-task-btn" title="Delete Task">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                `;

                // Events
                const checkBtn = card.querySelector('.task-check-btn');
                checkBtn.addEventListener('click', () => {
                    task.completed = !task.completed;
                    if (task.completed) AudioEngine.playTransitionChime();
                    this.saveAndRefresh();
                });

                const deleteBtn = card.querySelector('.delete-task-btn');
                deleteBtn.addEventListener('click', () => {
                    state.tasks = state.tasks.filter(t => t.id !== task.id);
                    AudioEngine.playTone(300, 'sawtooth', 0.1);
                    showToast('Task removed');
                    this.saveAndRefresh();
                });

                list.appendChild(card);
            });
        },

        updateMetrics() {
            if (!state.mealPlanConfigured) {
                document.getElementById('metricCircadianWindow').textContent = `-- hrs`;
                document.getElementById('metricAllocatedWork').textContent = `0.0 hrs`;
                document.getElementById('metricFreeBuffer').textContent = `-- hrs`;
                const conflictEl = document.getElementById('metricConflictStatus');
                if (conflictEl) {
                    conflictEl.innerHTML = `<i class="fa-solid fa-hourglass-start"></i> Not Set`;
                }
                const postMealEl = document.getElementById('postWorkoutMealCalc');
                if (postMealEl) {
                    postMealEl.textContent = `Awaiting Schedule Setup`;
                }
                return;
            }

            const wakeMins = TimeUtil.timeToMinutes(state.anchors.sleepEnd);
            const sleepMins = TimeUtil.timeToMinutes(state.anchors.sleepStart);
            const circadianHrs = ((sleepMins - wakeMins) / 60).toFixed(1);

            const allocatedMins = state.tasks.reduce((sum, t) => sum + (t.duration || 60), 0);
            const allocatedHrs = (allocatedMins / 60).toFixed(1);

            const freeSlots = ScheduleEngine.findFreeSlots();
            const totalFreeMins = freeSlots.reduce((sum, s) => sum + s.duration, 0);
            const freeBufferHrs = (totalFreeMins / 60).toFixed(1);

            document.getElementById('metricCircadianWindow').textContent = `${circadianHrs} hrs`;
            document.getElementById('metricAllocatedWork').textContent = `${allocatedHrs} hrs`;
            document.getElementById('metricFreeBuffer').textContent = `${freeBufferHrs} hrs`;
            const conflictEl = document.getElementById('metricConflictStatus');
            if (conflictEl) {
                conflictEl.innerHTML = `<i class="fa-solid fa-shield-check"></i> 0 Overlaps`;
            }

            // Calculate post workout chain display
            const wStart = TimeUtil.timeToMinutes(state.anchors.workoutStart);
            const wEnd = wStart + Number(state.anchors.workoutDuration);
            const postMealMins = wEnd + 30;
            const postMealEl = document.getElementById('postWorkoutMealCalc');
            if (postMealEl) {
                postMealEl.textContent = `Pinned to ${TimeUtil.format12H(TimeUtil.minutesToTime(postMealMins))}`;
            }
        },

        syncAnchorInputs() {
            document.getElementById('sleepStartInput').value = state.anchors.sleepStart;
            document.getElementById('sleepEndInput').value = state.anchors.sleepEnd;
            document.getElementById('breakfastTimeInput').value = state.anchors.breakfast;
            document.getElementById('lunchTimeInput').value = state.anchors.lunch;
            document.getElementById('dinnerTimeInput').value = state.anchors.dinner;
            document.getElementById('workoutStartInput').value = state.anchors.workoutStart;
            document.getElementById('workoutDurationInput').value = state.anchors.workoutDuration;
        },

        updateNowCursor() {
            const cursor = document.getElementById('timelineNowCursor');
            if (!cursor) return;

            const now = new Date();
            const curMins = (now.getHours() * 60) + now.getMinutes() + (now.getSeconds() / 60);
            const currentView = state.timelineView || 'table';

            if (currentView === 'active-day') {
                const startBound = 360;  // 06:00
                const endBound = 1380;   // 23:00
                const totalMins = endBound - startBound;

                if (curMins < startBound || curMins > endBound) {
                    cursor.style.display = 'none';
                } else {
                    cursor.style.display = 'block';
                    const percent = ((curMins - startBound) / totalMins) * 100;
                    cursor.style.left = `${percent}%`;
                }
            } else {
                cursor.style.display = 'block';
                const percent = (curMins / 1440) * 100;
                cursor.style.left = `${percent}%`;
            }
        },

        startLiveClock() {
            const updateClock = () => {
                const now = new Date();
                const timeStr = now.toTimeString().split(' ')[0];
                const clockEl = document.getElementById('currentTimeDisplay');
                if (clockEl) clockEl.textContent = timeStr;

                this.updateNowCursor();
                AlarmEngine.checkAlarms();
            };

            updateClock();
            setInterval(updateClock, 1000);
        },

        saveAndRefresh() {
            localStorage.setItem(STORAGE_KEY_STATE, JSON.stringify(state));
            this.renderAll();
        },

        bindEvents() {
            // Timeline View Switcher Pills
            document.querySelectorAll('#timelineViewSwitcher .view-pill').forEach(pill => {
                pill.addEventListener('click', () => {
                    const view = pill.dataset.view;
                    document.querySelectorAll('#timelineViewSwitcher .view-pill').forEach(p => p.classList.remove('active'));
                    pill.classList.add('active');
                    state.timelineView = view;
                    AudioEngine.playTone(650, 'sine', 0.05);

                    const viewLabels = {
                        'fit': '24H Fit View',
                        'active-day': 'Active Day View (06:00 - 23:00)',
                        'detailed': 'Detailed Scrollable 2x View',
                        'table': 'Full Day Schedule Table'
                    };
                    showToast(`Timeline Mode: ${viewLabels[view] || view}`);

                    this.renderTimelineRuler();
                    this.renderTimelineTrack();
                    this.renderScheduleTable();
                });
            });

            // Schedule Table Category Filters
            document.querySelectorAll('#tableCategoryFilters .filter-pill').forEach(pill => {
                pill.addEventListener('click', () => {
                    const filter = pill.dataset.filter;
                    document.querySelectorAll('#tableCategoryFilters .filter-pill').forEach(p => p.classList.remove('active'));
                    pill.classList.add('active');
                    state.tableFilter = filter;
                    AudioEngine.playTone(550, 'sine', 0.04);
                    this.renderScheduleTable();
                });
            });

            // Global Dismiss for Tooltip on scroll/resize
            window.addEventListener('scroll', () => {
                const tooltip = document.getElementById('timelineTooltip');
                if (tooltip && tooltip.style.display !== 'none') {
                    tooltip.style.display = 'none';
                }
            }, { passive: true });

            window.addEventListener('resize', () => {
                const tooltip = document.getElementById('timelineTooltip');
                if (tooltip && tooltip.style.display !== 'none') {
                    tooltip.style.display = 'none';
                }
            });

            // Anchor Inputs Change
            ['sleepStartInput', 'sleepEndInput', 'breakfastTimeInput', 'lunchTimeInput', 'dinnerTimeInput', 'workoutStartInput', 'workoutDurationInput'].forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.addEventListener('change', () => {
                        state.anchors.sleepStart = document.getElementById('sleepStartInput').value;
                        state.anchors.sleepEnd = document.getElementById('sleepEndInput').value;
                        state.anchors.breakfast = document.getElementById('breakfastTimeInput').value;
                        state.anchors.lunch = document.getElementById('lunchTimeInput').value;
                        state.anchors.dinner = document.getElementById('dinnerTimeInput').value;
                        state.anchors.workoutStart = document.getElementById('workoutStartInput').value;
                        state.anchors.workoutDuration = document.getElementById('workoutDurationInput').value;
                        state.mealPlanConfigured = true;
                        AudioEngine.playTone(500, 'sine', 0.05);
                        this.saveAndRefresh();
                    });
                }
            });

            // Reset Anchors
            document.getElementById('resetAnchorsBtn').addEventListener('click', () => {
                state.anchors = { ...defaultAnchors };
                state.mealPlanConfigured = true;
                showToast('Daily routines reset to default times');
                this.saveAndRefresh();
            });

            // Strategy Switcher Pills
            document.querySelectorAll('.strategy-pill').forEach(pill => {
                pill.addEventListener('click', () => {
                    document.querySelectorAll('.strategy-pill').forEach(p => p.classList.remove('active'));
                    pill.classList.add('active');
                    state.strategy = pill.dataset.strategy;
                    AudioEngine.playTone(700, 'sine', 0.05);
                    const strategyNames = {
                        'ripple': 'Auto-Shift Tasks',
                        'least-priority': 'Skip Low Priority',
                        'strict': 'Show Overlaps'
                    };
                    showToast(`Overlap Resolver: ${strategyNames[pill.dataset.strategy] || pill.dataset.strategy}`);
                    this.saveAndRefresh();
                });
            });

            // Hardware Alarm Test Buttons
            document.getElementById('testWakeChimeBtn').addEventListener('click', () => AudioEngine.playWakeChime());
            document.getElementById('testTransitionChimeBtn').addEventListener('click', () => AudioEngine.playTransitionChime());
            document.getElementById('testUrgentAlertBtn').addEventListener('click', () => AudioEngine.playUrgentAlert());

            // Modal Triggers
            document.getElementById('openAddTaskModalBtn').addEventListener('click', () => this.openTaskModal());
            document.getElementById('closeTaskModalBtn').addEventListener('click', () => this.closeTaskModal());
            document.getElementById('cancelTaskModalBtn').addEventListener('click', () => this.closeTaskModal());

            // Free Slots Modal
            document.getElementById('openAnalyzeSlotsBtn').addEventListener('click', () => this.openSlotsModal());
            document.getElementById('closeSlotsModalBtn').addEventListener('click', () => this.closeSlotsModal());
            document.getElementById('dismissSlotsModalBtn').addEventListener('click', () => this.closeSlotsModal());

            // Task Form Submission
            document.getElementById('taskForm').addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveTaskFromModal();
            });

            // Rigidity Type Radio Switching in Modal
            document.querySelectorAll('input[name="rigidityType"]').forEach(radio => {
                radio.addEventListener('change', (e) => {
                    const val = e.target.value;
                    document.querySelectorAll('.rigidity-card').forEach(c => c.classList.remove('active'));
                    e.target.closest('.rigidity-card').classList.add('active');

                    document.getElementById('elasticControlsSection').hidden = val !== 'elastic';
                    document.getElementById('hardControlsSection').hidden = val !== 'hard';
                    document.getElementById('relativeControlsSection').hidden = val !== 'relative';
                });
            });

            // Command Palette (Ctrl+K)
            document.getElementById('searchTriggerBtn').addEventListener('click', () => this.toggleCommandPalette(true));
            document.getElementById('commandPaletteInput').addEventListener('input', (e) => {
                this.renderCommandResults(e.target.value);
            });
            document.addEventListener('keydown', (e) => {
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                    e.preventDefault();
                    this.toggleCommandPalette();
                } else if (e.key === 'Escape') {
                    this.toggleCommandPalette(false);
                    this.closeTaskModal();
                    this.closeSlotsModal();
                    this.closeWizardModal();
                }
            });

            // Start Schedule Wizard Triggers
            const startWizardBtn = document.getElementById('startScheduleWizardBtn');
            if (startWizardBtn) startWizardBtn.addEventListener('click', () => this.openWizardModal());

            const closeWizardBtn = document.getElementById('closeWizardModalBtn');
            if (closeWizardBtn) closeWizardBtn.addEventListener('click', () => this.closeWizardModal());

            const cancelWizardBtn = document.getElementById('cancelWizardBtn');
            if (cancelWizardBtn) cancelWizardBtn.addEventListener('click', () => this.closeWizardModal());

            const applyMealPlanBtn = document.getElementById('applyMealPlanBtn');
            if (applyMealPlanBtn) applyMealPlanBtn.addEventListener('click', () => this.applyMealPlan());

            // Meal Plan Selection Cards in Wizard
            document.querySelectorAll('.meal-plan-card').forEach(card => {
                card.addEventListener('click', (e) => {
                    if (e.target.tagName === 'INPUT') return;
                    const plan = card.dataset.plan;
                    this.selectMealPlanCard(plan);
                });
            });

            document.querySelectorAll('input[name="mealPlanChoice"]').forEach(radio => {
                radio.addEventListener('change', (e) => {
                    this.selectMealPlanCard(e.target.value);
                });
            });

            // Gym Meal Live Calculation Listeners
            ['wizardGymStartInput', 'wizardGymDurationInput'].forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.addEventListener('input', () => this.updateGymMealPreview());
                    el.addEventListener('change', () => this.updateGymMealPreview());
                }
            });

            // Timeline Hero: Add Task Button
            document.getElementById('timelineAddTaskBtn').addEventListener('click', () => this.openTaskModal());

            // Theme Toggle
            document.getElementById('themeToggleBtn').addEventListener('click', () => {
                state.theme = state.theme === 'dark' ? 'light' : 'dark';
                document.documentElement.setAttribute('data-theme', state.theme);
                const icon = document.getElementById('themeIcon');
                icon.className = state.theme === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
                showToast(`Theme switched to ${state.theme.toUpperCase()}`);
            });

            // ICS Export Buttons
            document.getElementById('exportIcsBtn').addEventListener('click', () => this.exportIcsFile());
            document.getElementById('downloadIcsFileBtn').addEventListener('click', () => this.exportIcsFile());

            // Mobile Nav Scrolling
            document.querySelectorAll('.bottom-nav-item').forEach(btn => {
                btn.addEventListener('click', () => {
                    const targetId = btn.dataset.target;
                    const el = document.getElementById(targetId);
                    if (el) {
                        el.scrollIntoView({ behavior: 'smooth' });
                        document.querySelectorAll('.bottom-nav-item').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                    }
                });
            });

            // Wake Up Time Change Auto-Alarm Trigger
            const sleepEndInput = document.getElementById('sleepEndInput');
            if (sleepEndInput) {
                sleepEndInput.addEventListener('change', () => {
                    const newWakeTime = sleepEndInput.value;
                    setTimeout(() => {
                        AlarmEngine.promptAlarmSetup('Wake Up Routine', newWakeTime, 'sleepEnd', 'wake');
                    }, 400);
                });
            }

            // Alarm Prompt Modal Events
            const alarmPromptForm = document.getElementById('alarmPromptForm');
            if (alarmPromptForm) {
                alarmPromptForm.addEventListener('submit', (e) => {
                    e.preventDefault();
                    AlarmEngine.saveAlarmFromModal();
                });
            }

            const closeAlarmPromptBtn = document.getElementById('closeAlarmPromptModalBtn');
            if (closeAlarmPromptBtn) {
                closeAlarmPromptBtn.addEventListener('click', () => {
                    document.getElementById('alarmPromptModalOverlay').hidden = true;
                });
            }

            const cancelAlarmPromptBtn = document.getElementById('cancelAlarmPromptBtn');
            if (cancelAlarmPromptBtn) {
                cancelAlarmPromptBtn.addEventListener('click', () => {
                    document.getElementById('alarmPromptModalOverlay').hidden = true;
                });
            }

            // Recurrence Preset Pills
            document.querySelectorAll('#alarmRecurrencePills .recurrence-pill').forEach(pill => {
                pill.addEventListener('click', () => {
                    const preset = pill.dataset.preset;
                    AlarmEngine.setRecurrencePreset(preset);
                });
            });

            // Custom Day Chips
            document.querySelectorAll('#customDaysSelector .day-chip').forEach(chip => {
                chip.addEventListener('click', (e) => {
                    // Switch to custom preset if clicked
                    document.querySelectorAll('#alarmRecurrencePills .recurrence-pill').forEach(p => {
                        p.classList.toggle('active', p.dataset.preset === 'custom');
                    });
                    const input = chip.querySelector('input');
                    if (e.target !== input) {
                        input.checked = !input.checked;
                    }
                    chip.classList.toggle('selected', input.checked);
                });
            });

            // Test Alarm Sound inside Modal
            const testAlarmModalSoundBtn = document.getElementById('testAlarmModalSoundBtn');
            if (testAlarmModalSoundBtn) {
                testAlarmModalSoundBtn.addEventListener('click', () => {
                    const soundSelect = document.getElementById('alarmSoundSelect');
                    const soundType = soundSelect ? soundSelect.value : 'wake-chime';
                    AudioEngine.playSoundByType(soundType);
                });
            }

            // Fullscreen Alarm Ringing Screen Buttons
            const dismissAlarmBtn = document.getElementById('dismissAlarmBtn');
            if (dismissAlarmBtn) {
                dismissAlarmBtn.addEventListener('click', () => AlarmEngine.dismissAlarm());
            }

            const snoozeAlarmBtn = document.getElementById('snoozeAlarmBtn');
            if (snoozeAlarmBtn) {
                snoozeAlarmBtn.addEventListener('click', () => AlarmEngine.snoozeAlarm(5));
            }

            // Add Custom Alarm Manual Button in Bento Card
            const addNewAlarmManualBtn = document.getElementById('addNewAlarmManualBtn');
            if (addNewAlarmManualBtn) {
                addNewAlarmManualBtn.addEventListener('click', () => {
                    AlarmEngine.promptAlarmSetup('Scheduled Alarm', '07:00', null, 'custom');
                });
            }

            // Request Notification Permission Button in Bento Card
            const reqNotifyBtn = document.getElementById('requestNotifyPermissionBtn');
            if (reqNotifyBtn) {
                if ('Notification' in window && Notification.permission === 'granted') {
                    reqNotifyBtn.innerHTML = '<i class="fa-solid fa-bell-check text-emerald"></i> Enabled';
                    reqNotifyBtn.disabled = true;
                    reqNotifyBtn.style.opacity = '0.7';
                }

                reqNotifyBtn.addEventListener('click', async () => {
                    if ('Notification' in window) {
                        try {
                            const res = await Notification.requestPermission();
                            if (res === 'granted') {
                                reqNotifyBtn.innerHTML = '<i class="fa-solid fa-bell-check text-emerald"></i> Enabled';
                                reqNotifyBtn.disabled = true;
                                reqNotifyBtn.style.opacity = '0.7';
                                showToast('🔔 System notifications enabled for alarms!');
                            } else {
                                showToast('System notification permission was denied or dismissed.');
                            }
                        } catch (err) {
                            console.warn(err);
                        }
                    } else {
                        showToast('Notification API not supported in this browser.');
                    }
                });
            }
        },

        openWizardModal() {
            const overlay = document.getElementById('wizardModalOverlay');
            if (overlay) {
                overlay.hidden = false;
                this.selectMealPlanCard(state.activeMealPlan || 'standard3');
                this.updateGymMealPreview();
            }
        },

        closeWizardModal() {
            const overlay = document.getElementById('wizardModalOverlay');
            if (overlay) overlay.hidden = true;
        },

        selectMealPlanCard(plan) {
            document.querySelectorAll('.meal-plan-card').forEach(card => {
                const isSelected = card.dataset.plan === plan;
                card.classList.toggle('active', isSelected);
                const radio = card.querySelector('input[type="radio"]');
                if (radio) radio.checked = isSelected;
            });

            // Toggle dynamic inputs
            const gymInputs = document.getElementById('gymInputsContainer');
            if (gymInputs) gymInputs.style.display = (plan === 'fitness5') ? 'block' : 'none';
        },

        updateGymMealPreview() {
            const startVal = document.getElementById('wizardGymStartInput')?.value || '17:30';
            const durVal = Number(document.getElementById('wizardGymDurationInput')?.value || 60);

            const startMins = TimeUtil.timeToMinutes(startVal);
            const preMins = startMins - 120; // 2 hours before gym
            const postMins = startMins + durVal; // immediately after gym

            const preTime12 = TimeUtil.format12H(TimeUtil.minutesToTime(preMins));
            const postTime12 = TimeUtil.format12H(TimeUtil.minutesToTime(postMins));
            const preTime24 = TimeUtil.minutesToTime(preMins);
            const postTime24 = TimeUtil.minutesToTime(postMins);

            const previewEl = document.getElementById('gymCalcPreviewText');
            if (previewEl) {
                previewEl.innerHTML = `Pre-Workout Diet set to <strong>${preTime24} (${preTime12})</strong> [2h before] &amp; Post-Workout Diet at <strong>${postTime24} (${postTime12})</strong> [after gym].`;
            }
        },

        applyMealPlan() {
            const selectedRadio = document.querySelector('input[name="mealPlanChoice"]:checked');
            const chosenPlan = selectedRadio ? selectedRadio.value : 'standard3';

            state.activeMealPlan = chosenPlan;
            state.mealPlanConfigured = true;

            if (chosenPlan === 'standard3') {
                state.anchors.breakfast = '08:00';
                state.anchors.lunch = '13:00';
                state.anchors.dinner = '20:00';
                // Remove previous diet tasks if any
                state.tasks = state.tasks.filter(t => !t.id.startsWith('gym-diet-'));
            } else if (chosenPlan === 'intermittent2') {
                state.anchors.lunch = '13:00';
                state.anchors.dinner = '20:00';
                state.tasks = state.tasks.filter(t => !t.id.startsWith('gym-diet-'));
            } else if (chosenPlan === 'fitness5') {
                const gymStart = document.getElementById('wizardGymStartInput')?.value || '17:30';
                const gymDuration = Number(document.getElementById('wizardGymDurationInput')?.value || 60);

                state.anchors.breakfast = '08:00';
                state.anchors.lunch = '13:00';
                state.anchors.dinner = '20:30';
                state.anchors.workoutStart = gymStart;
                state.anchors.workoutDuration = gymDuration;

                const gymStartMins = TimeUtil.timeToMinutes(gymStart);
                const preDietMins = gymStartMins - 120;
                const postDietMins = gymStartMins + gymDuration;

                // Remove existing auto-diet tasks
                state.tasks = state.tasks.filter(t => !t.id.startsWith('gym-diet-'));

                // Add Pre-Workout Diet (2 hours before gym)
                state.tasks.push({
                    id: `gym-diet-pre-${Date.now()}`,
                    title: 'Pre-Workout Diet (Energy & Carbs)',
                    category: 'health',
                    priority: 'high',
                    rigidity: 'hard',
                    hardStart: TimeUtil.minutesToTime(preDietMins),
                    hardEnd: TimeUtil.minutesToTime(preDietMins + 30),
                    duration: 30,
                    completed: false
                });

                // Add Post-Workout Diet (Immediately after gym)
                state.tasks.push({
                    id: `gym-diet-post-${Date.now() + 1}`,
                    title: 'Post-Workout Diet (Protein & Recovery)',
                    category: 'health',
                    priority: 'high',
                    rigidity: 'hard',
                    hardStart: TimeUtil.minutesToTime(postDietMins),
                    hardEnd: TimeUtil.minutesToTime(postDietMins + 30),
                    duration: 30,
                    completed: false
                });
            } else if (chosenPlan === 'custom') {
                // Blank canvas — no preset meal anchors or diet tasks
                state.tasks = state.tasks.filter(t => !t.id.startsWith('gym-diet-'));
            }

            AudioEngine.playWakeChime();
            const planNames = {
                'standard3': 'Standard 3-Meal Plan',
                'intermittent2': '2 Meals a Day Plan',
                'fitness5': '5 Meals Fitness & Gym Plan',
                'custom': 'Custom / Blank Plan'
            };
            showToast(`✨ ${planNames[chosenPlan]} configured! Schedule ready.`);
            this.closeWizardModal();
            this.saveAndRefresh();
        },

        openTaskModal() {
            document.getElementById('taskForm').reset();
            document.getElementById('taskModalOverlay').hidden = false;
        },
        closeTaskModal() {
            document.getElementById('taskModalOverlay').hidden = true;
        },

        saveTaskFromModal() {
            const title = document.getElementById('taskTitleInput').value.trim();
            const category = document.getElementById('taskCategoryInput').value;
            const priority = document.getElementById('taskPriorityInput').value;
            const rigidity = document.querySelector('input[name="rigidityType"]:checked').value;

            const newTask = {
                id: `task-${Date.now()}`,
                title,
                category,
                priority,
                rigidity,
                completed: false
            };

            if (rigidity === 'elastic') {
                newTask.duration = Number(document.getElementById('taskDurationInput').value);
                newTask.preferredStart = document.getElementById('taskPreferredStartInput').value;
            } else if (rigidity === 'hard') {
                newTask.hardStart = document.getElementById('taskHardStartInput').value;
                newTask.hardEnd = document.getElementById('taskHardEndInput').value;
            } else if (rigidity === 'relative') {
                newTask.relativeTarget = document.getElementById('taskRelativeTarget').value;
                newTask.relativeOffset = Number(document.getElementById('taskRelativeOffset').value);
                newTask.duration = Number(document.getElementById('taskRelativeDuration').value);
            }

            state.tasks.push(newTask);
            state.mealPlanConfigured = true;
            AudioEngine.playTransitionChime();
            showToast('New task added!');
            this.closeTaskModal();
            this.saveAndRefresh();

            // Auto-prompt alarm for High Priority or Fixed-Time tasks
            if (priority === 'p1' || rigidity === 'hard') {
                const triggerTime = newTask.hardStart || newTask.preferredStart || '09:00';
                const alarmType = priority === 'p1' ? 'priority' : 'hard';
                setTimeout(() => {
                    AlarmEngine.promptAlarmSetup(newTask.title, triggerTime, newTask.id, alarmType);
                }, 350);
            }
        },

        openSlotsModal() {
            const container = document.getElementById('freeSlotsContainer');
            container.innerHTML = '';

            if (!state.mealPlanConfigured) {
                container.innerHTML = `
                    <div style="text-align:center; padding:1.5rem 0.5rem; color:var(--text-muted);">
                        <p style="margin-bottom:0.75rem;">No schedule has been configured yet.</p>
                        <button class="btn btn-primary btn-sm" onclick="window.PiScheduler.closeSlotsModal(); window.PiScheduler.openWizardModal();">
                            <i class="fa-solid fa-wand-magic-sparkles"></i> Start New Schedule
                        </button>
                    </div>
                `;
                document.getElementById('slotsModalOverlay').hidden = false;
                return;
            }

            const freeSlots = ScheduleEngine.findFreeSlots();
            if (freeSlots.length === 0) {
                container.innerHTML = `<p style="color:var(--text-muted); text-align:center; padding:1rem;">No free time gaps found in your daily schedule.</p>`;
            } else {
                freeSlots.forEach(slot => {
                    const item = document.createElement('div');
                    item.className = 'free-slot-item';
                    item.innerHTML = `
                        <span class="free-slot-time"><i class="fa-solid fa-clock"></i> ${TimeUtil.format12H(TimeUtil.minutesToTime(slot.start))} - ${TimeUtil.format12H(TimeUtil.minutesToTime(slot.end))}</span>
                        <span class="free-slot-duration">${slot.duration} Mins Free</span>
                    `;
                    container.appendChild(item);
                });
            }

            document.getElementById('slotsModalOverlay').hidden = false;
        },
        closeSlotsModal() {
            document.getElementById('slotsModalOverlay').hidden = true;
        },

        toggleCommandPalette(show) {
            const overlay = document.getElementById('commandPaletteOverlay');
            const isHidden = overlay.hidden;
            const targetState = show !== undefined ? !show : !isHidden;
            overlay.hidden = targetState;

            if (!targetState) {
                const input = document.getElementById('commandPaletteInput');
                input.value = '';
                input.focus();
                this.renderCommandResults();
            }
        },

        renderCommandResults(filter = '') {
            const resultsContainer = document.getElementById('commandPaletteResults');
            const commands = [
                // ── Actions ──
                { icon: 'fa-solid fa-wand-magic-sparkles', color: 'text-accent', title: 'Start New Schedule / Meal Plan', cat: 'Action', action: () => { this.openWizardModal(); this.toggleCommandPalette(false); }},
                { icon: 'fa-solid fa-plus', color: 'text-emerald', title: 'Add New Task', cat: 'Action', action: () => { this.openTaskModal(); this.toggleCommandPalette(false); }},
                { icon: 'fa-solid fa-wand-magic-sparkles', color: 'text-cyan', title: 'Find Free Time Slots', cat: 'Analysis', action: () => { this.openSlotsModal(); this.toggleCommandPalette(false); }},
                { icon: 'fa-solid fa-calendar-plus', color: 'text-emerald', title: 'Save to Calendar (.ics)', cat: 'Export', action: () => { this.exportIcsFile(); this.toggleCommandPalette(false); }},
                { icon: 'fa-solid fa-rotate-left', color: 'text-amber', title: 'Reset Routines to Defaults', cat: 'Action', action: () => { state.anchors = { ...defaultAnchors }; showToast('Daily routines reset to default times'); this.saveAndRefresh(); this.toggleCommandPalette(false); }},

                // ── Toggles ──
                { icon: 'fa-solid fa-moon', color: 'text-accent', title: 'Toggle Light / Dark Theme', cat: 'Toggle', action: () => { document.getElementById('themeToggleBtn').click(); this.toggleCommandPalette(false); }},

                // ── Timeline Views ──
                { icon: 'fa-solid fa-table-list', color: 'text-emerald', title: 'Switch to Schedule Table', cat: 'View', action: () => { this.switchTimelineView('table'); this.toggleCommandPalette(false); }},
                { icon: 'fa-solid fa-compress', color: 'text-emerald', title: 'Switch to 24H Fit View', cat: 'View', action: () => { this.switchTimelineView('fit'); this.toggleCommandPalette(false); }},
                { icon: 'fa-solid fa-sun', color: 'text-amber', title: 'Switch to Active Day View', cat: 'View', action: () => { this.switchTimelineView('active-day'); this.toggleCommandPalette(false); }},
                { icon: 'fa-solid fa-maximize', color: 'text-cyan', title: 'Switch to Detailed View', cat: 'View', action: () => { this.switchTimelineView('detailed'); this.toggleCommandPalette(false); }},

                // ── Overlap Resolver ──
                { icon: 'fa-solid fa-water', color: 'text-cyan', title: 'Resolver: Auto-Shift Tasks', cat: 'Overlap', action: () => { this.setStrategy('ripple'); this.toggleCommandPalette(false); }},
                { icon: 'fa-solid fa-arrows-split-up-and-left', color: 'text-rose', title: 'Resolver: Skip Low Priority', cat: 'Overlap', action: () => { this.setStrategy('least-priority'); this.toggleCommandPalette(false); }},
                { icon: 'fa-solid fa-ban', color: 'text-amber', title: 'Resolver: Show Overlaps', cat: 'Overlap', action: () => { this.setStrategy('strict'); this.toggleCommandPalette(false); }},

                // ── Sound Alerts ──
                { icon: 'fa-solid fa-bell', color: 'text-amber', title: 'Test Wake Alarm', cat: 'Sound Tones', action: () => { AudioEngine.playWakeChime(); this.toggleCommandPalette(false); }},
                { icon: 'fa-solid fa-bell', color: 'text-cyan', title: 'Test Task Change Tone', cat: 'Sound Tones', action: () => { AudioEngine.playTransitionChime(); this.toggleCommandPalette(false); }},
                { icon: 'fa-solid fa-bell', color: 'text-rose', title: 'Test Urgent Alert', cat: 'Sound Tones', action: () => { AudioEngine.playUrgentAlert(); this.toggleCommandPalette(false); }},

                // ── Navigation ──
                { icon: 'fa-solid fa-chart-gantt', color: 'text-accent', title: 'Jump to Timeline', cat: 'Navigate', action: () => { document.getElementById('timelineHeroSection').scrollIntoView({ behavior: 'smooth' }); this.toggleCommandPalette(false); }},
                { icon: 'fa-solid fa-bed', color: 'text-cyan', title: 'Jump to Daily Routines', cat: 'Navigate', action: () => { document.getElementById('circadianCard').scrollIntoView({ behavior: 'smooth' }); this.toggleCommandPalette(false); }},
                { icon: 'fa-solid fa-list-check', color: 'text-emerald', title: 'Jump to Today\'s Tasks', cat: 'Navigate', action: () => { document.getElementById('tasksCard').scrollIntoView({ behavior: 'smooth' }); this.toggleCommandPalette(false); }},
                { icon: 'fa-solid fa-clock', color: 'text-amber', title: 'Jump to Sound Alerts', cat: 'Navigate', action: () => { document.getElementById('alarmCard').scrollIntoView({ behavior: 'smooth' }); this.toggleCommandPalette(false); }},
            ];

            const query = filter.toLowerCase().trim();
            const filtered = query
                ? commands.filter(c => c.title.toLowerCase().includes(query) || c.cat.toLowerCase().includes(query))
                : commands;

            if (filtered.length === 0) {
                resultsContainer.innerHTML = `<div class="cmd-empty"><i class="fa-solid fa-ghost"></i> No matching commands</div>`;
                return;
            }

            // Group by category for section headers
            const grouped = {};
            filtered.forEach(c => {
                if (!grouped[c.cat]) grouped[c.cat] = [];
                grouped[c.cat].push(c);
            });

            resultsContainer.innerHTML = '';
            Object.entries(grouped).forEach(([cat, items]) => {
                const section = document.createElement('div');
                section.className = 'cmd-section';
                section.innerHTML = `<div class="cmd-section-header">${cat}</div>`;
                items.forEach(cmd => {
                    const row = document.createElement('div');
                    row.className = 'cmd-item';
                    row.innerHTML = `
                        <div class="cmd-item-left"><i class="${cmd.icon} ${cmd.color}"></i> <span class="cmd-title">${cmd.title}</span></div>
                        <span class="cmd-cat">${cmd.cat}</span>
                    `;
                    row.addEventListener('click', cmd.action);
                    section.appendChild(row);
                });
                resultsContainer.appendChild(section);
            });
        },

        switchTimelineView(view) {
            document.querySelectorAll('#timelineViewSwitcher .view-pill').forEach(p => p.classList.remove('active'));
            const target = document.querySelector(`#timelineViewSwitcher .view-pill[data-view="${view}"]`);
            if (target) target.classList.add('active');
            state.timelineView = view;
            const viewLabels = { 'fit': '24H Fit View', 'active-day': 'Active Day View', 'detailed': 'Detailed 2x View', 'table': 'Schedule Table' };
            showToast(`Timeline Mode: ${viewLabels[view] || view}`);
            AudioEngine.playTone(650, 'sine', 0.05);
            this.renderTimelineRuler();
            this.renderTimelineTrack();
            this.renderScheduleTable();
        },

        setStrategy(strategy) {
            document.querySelectorAll('.strategy-pill').forEach(p => p.classList.remove('active'));
            const target = document.querySelector(`.strategy-pill[data-strategy="${strategy}"]`);
            if (target) target.classList.add('active');
            state.strategy = strategy;
            AudioEngine.playTone(700, 'sine', 0.05);
            showToast(`Conflict Engine: ${strategy.toUpperCase()}`);
            this.saveAndRefresh();
        },

        exportIcsFile() {
            const timelineEvents = ScheduleEngine.calculateTimeline();
            const today = new Date().toISOString().replace(/-|:|\.\d+/g, '').slice(0, 8);

            let icsLines = [
                'BEGIN:VCALENDAR',
                'VERSION:2.0',
                'PRODID:-//Daily Planner//Circadian Reactive Engine//EN',
                'CALSCALE:GREGORIAN',
                'METHOD:PUBLISH'
            ];

            timelineEvents.forEach(evt => {
                const sHours = String(Math.floor(evt.start / 60)).padStart(2, '0');
                const sMins = String(evt.start % 60).padStart(2, '0');
                const eHours = String(Math.floor(evt.end / 60)).padStart(2, '0');
                const eMins = String(evt.end % 60).padStart(2, '0');

                const dtStart = `${today}T${sHours}${sMins}00`;
                const dtEnd = `${today}T${eHours}${eMins}00`;

                icsLines.push('BEGIN:VEVENT');
                icsLines.push(`SUMMARY:${evt.title}`);
                icsLines.push(`DTSTART:${dtStart}`);
                icsLines.push(`DTEND:${dtEnd}`);
                icsLines.push('BEGIN:VALARM');
                icsLines.push('TRIGGER:-PT10M');
                icsLines.push('ACTION:DISPLAY');
                icsLines.push('DESCRIPTION:Daily Schedule Transition Reminder');
                icsLines.push('END:VALARM');
                icsLines.push('END:VEVENT');
            });

            icsLines.push('END:VCALENDAR');

            const blob = new Blob([icsLines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `Pi_Scheduler_${today}.ics`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            AudioEngine.playWakeChime();
            showToast('📅 Calendar .ICS file generated & downloaded!');
        }
    };

    /* Toast Notification Helper */
    function showToast(msg) {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = `<i class="fa-solid fa-circle-info text-accent"></i> <span>${msg}</span>`;

        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    /* PWA Service Worker Registration */
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(reg => console.log('[Daily Planner SW] Registered:', reg.scope))
                .catch(err => console.warn('[Daily Planner SW] Registration failed:', err));
        });
    }

    // Expose global app for inline calls
    window.PiScheduler = UI;
    window.AnchorApp = UI;

    // Helper functions for inline triggers from schedule table / timeline
    window.PiScheduler.openAlarmPromptForTask = function(taskId, title, time, type = 'task') {
        AlarmEngine.promptAlarmSetup(title, time, taskId, type);
    };
    window.PiScheduler.testAlarmSound = function(soundType) {
        AudioEngine.playSoundByType(soundType);
    };

    // Load persisted state if exists
    const saved = localStorage.getItem(STORAGE_KEY_STATE) || localStorage.getItem(STORAGE_KEY_STATE_LEGACY);
    if (saved) {
        try {
            state = { ...state, ...JSON.parse(saved) };
        } catch (e) {
            console.error('Failed to parse saved state:', e);
        }
    }

    // Boot App on DOM Ready
    document.addEventListener('DOMContentLoaded', () => UI.init());

})();
