// storage.js — localStorage 读写（设置 / 今日数据）
// 只操作 state 和 localStorage，不碰 DOM

import { state } from './state.js';

const SETTINGS_KEY = 'erhu_settings';

function todayKey() {
    return new Date().toISOString().split('T')[0];
}

// ─── 设置 ───

export function loadSettings() {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) {
        const parsed = JSON.parse(saved);
        state.settings = { ...state.settings, ...parsed };
    }
    return state.settings;
}

export function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
}

// ─── 今日数据 ───

export function loadSessionData() {
    const today = todayKey();
    const savedCount = localStorage.getItem(`erhu_today_count_${today}`);
    const savedLog = localStorage.getItem(`erhu_today_log_${today}`);

    if (savedCount) {
        state.count = parseInt(savedCount);
    }

    if (savedLog) {
        state.sessionLog = JSON.parse(savedLog);
    }
}

export function saveCount() {
    localStorage.setItem(`erhu_today_count_${todayKey()}`, state.count);
}

export function saveLog() {
    localStorage.setItem(`erhu_today_log_${todayKey()}`, JSON.stringify(state.sessionLog));
}

export function clearTodayData() {
    const today = todayKey();
    localStorage.removeItem(`erhu_today_count_${today}`);
    localStorage.removeItem(`erhu_today_log_${today}`);
}
