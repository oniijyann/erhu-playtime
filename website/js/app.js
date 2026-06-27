// app.js — 入口模块：初始化、回调注册、事件协调
// 依赖所有其他模块，是唯一知道"谁该做什么"的模块

import { state } from './state.js';
import * as audio from './audio.js';
import * as ui from './ui.js';
import * as storage from './storage.js';
import { startCalibration, cancelCalibration } from './calibrate.js';
import { showNotification, formatDuration } from './utils.js';
import { praises } from './praise.js';

// ─── 初始化 ───

function init() {
    // 1. 注册音频回调 → ui 渲染
    audio.setVolumeCallback(({ db, percent }) => {
        ui.updateVolumeDisplay(db, percent);
    });

    audio.setStatusCallback((status) => {
        ui.updateStatusDisplay(status);
    });

    audio.setPieceDetectedCallback((piece) => {
        handlePieceDetected(piece);
    });

    // 2. 时钟
    ui.updateCurrentTime();
    setInterval(() => ui.updateCurrentTime(), 1000);

    // 3. 加载持久化数据 → 同步 UI
    storage.loadSettings();
    ui.syncSettingsUI();

    storage.loadSessionData();
    ui.syncSessionUI();

    ui.updateThresholdLines();

    // 4. Tab 初始化
    ui.initTabs();

    // 5. 事件绑定
    ui.bindEvents({
        onStart: handleStart,
        onStop: handleStop,
        onCalibrate: () => ui.switchToSettingsTab(),
        onRefreshDevices: () => handleEnumerate(),
        onIncrement: () => manualAdjust(1),
        onDecrement: () => manualAdjust(-1),
        onReset: resetSession,
        onClear: clearToday,
        onSaveSettings: saveSettings,
        onQuietCalibrate: () => startCalibration('quiet'),
        onPlayingCalibrate: () => startCalibration('playing'),
        onCancelCalibration: cancelCalibration,

        onStartThresholdChange: (val) => {
            state.settings.startThreshold = val;
            ui.updateThresholdLines();
        },
        onEndThresholdChange: (val) => {
            state.settings.endThreshold = val;
            ui.updateThresholdLines();
        },
        onConfirmTimeChange: (val) => {
            state.settings.confirmTime = val;
        },
        onMinDurationChange: (val) => {
            state.settings.minDuration = val;
        },
        onMergeGapChange: (val) => {
            state.settings.mergeGap = val;
        },
        onStartCoverageEnabledChange: (val) => {
            state.settings.startCoverageEnabled = val;
        },
        onStartCoverageWindowChange: (val) => {
            state.settings.startCoverageWindow = val;
        },
        onStartCoverageRatioChange: (val) => {
            state.settings.startCoverageRatio = val;
        },
        onPlayingCoverageEnabledChange: (val) => {
            state.settings.playingCoverageEnabled = val;
        },
        onPlayingCoverageWindowChange: (val) => {
            state.settings.playingCoverageWindow = val;
        },
        onPlayingCoverageRatioChange: (val) => {
            state.settings.playingCoverageRatio = val;
        },
        onTargetCountChange: (val) => {
            if (!isNaN(val) && val >= 1) {
                state.settings.targetCount = val;
                ui.updateProgressBars();
            }
        },
        onTargetDurationMinChange: (val) => {
            if (!isNaN(val) && val >= 1) {
                state.settings.targetDurationMin = val;
                ui.updateProgressBars();
            }
        }
    });

    // 6. 设备热插拔监听（防抖）
    let deviceChangeTimer = null;
    navigator.mediaDevices.addEventListener('devicechange', () => {
        if (state.isMonitoring) return;
        if (deviceChangeTimer) clearTimeout(deviceChangeTimer);
        deviceChangeTimer = setTimeout(() => handleEnumerate(), 300);
    });

    // 7. 自动启动：枚举设备 + 保留流 + 连接
    autoStartOrEnumerate();
}

// ─── 设备枚举 ───

async function autoStartOrEnumerate() {
    const result = await audio.enumerateDevices({ keepStream: true });

    ui.renderDeviceList(result.deviceEntries, '');
    applyDeviceStatus(result);

    if (result.stream && result.deviceEntries && result.deviceEntries.length > 0) {
        audio.connectStream(result.stream);
        ui.setMonitoringButtons(true);
        showNotification('开始监测音频');
    }
}

async function handleEnumerate() {
    const result = await audio.enumerateDevices();

    ui.renderDeviceList(result.deviceEntries, ui.elements.audioDevice.value);
    applyDeviceStatus(result);
}

function applyDeviceStatus(result) {
    if (result.deviceEntries.length === 0) {
        ui.updateDeviceStatus('未检测到任何音频设备。请确认麦克风已连接并授予权限。', 'error');
    } else if (result.audioInputCount > 0) {
        let msg = '已检测到 ' + result.audioInputCount + ' 个音频输入设备';
        if (!result.labelsExposed) {
            msg += ' (标签未暴露，已使用回退名称)';
        }
        ui.updateDeviceStatus(msg, 'success');
    } else if (result.stream && result.isTrackFallback) {
        const msg = '已通过音频轨道检测到: ' + result.deviceEntries[0].label + ' (枚举API未返回设备列表)';
        ui.updateDeviceStatus(msg, 'warning');
    } else {
        ui.updateDeviceStatus(null);
    }
}

// ─── 监测控制 ───

async function handleStart() {
    const deviceId = ui.elements.audioDevice.value;
    if (!deviceId) {
        showNotification('请先选择音频输入设备', 'error');
        return;
    }

    try {
        await audio.startMonitoring(deviceId);
        ui.setMonitoringButtons(true);
        showNotification('开始监测音频');
    } catch (error) {
        console.error('Error starting monitoring:', error);
        showNotification('无法访问音频设备', 'error');
    }
}

function handleStop() {
    audio.stopMonitoring();
    ui.setMonitoringButtons(false);
    ui.updateStatusDisplay('SILENCE');
    showNotification('已停止监测');
}

// ─── 曲目检测回调 ───

function handlePieceDetected(piece) {
    const { mergeGap } = state.settings;
    const lastPiece = state.sessionLog[state.sessionLog.length - 1];

    // 检查与前一首的间隔，间隔 < mergeGap 则合并（间奏），不增加计数
    if (lastPiece && !lastPiece.manual) {
        const gap = (new Date(piece.startTime) - new Date(lastPiece.endTime)) / 1000;

        if (gap < mergeGap) {
            // 合并：延长上一首的 endTime，累加 duration，count 不变
            lastPiece.endTime = piece.endTime;
            lastPiece.duration += piece.duration;
            lastPiece.merged = true;

            storage.saveLog();

            ui.updateHistoryList();
            ui.updateStatistics();
            ui.updateMainConsoleStats();
            ui.updateProgressBars();

            const addedFormatted = formatDuration(piece.duration);
            showNotification(`间奏结束，合并到上一首 (+${addedFormatted})`);
            return;
        }
    }

    // 正常新增：新的一首
    state.count++;
    state.sessionLog.push(piece);
    storage.saveCount();
    storage.saveLog();

    ui.updateCounter(state.count);
    ui.updateHistoryList();
    ui.updateStatistics();
    ui.updateMainConsoleStats();
    ui.updateProgressBars();

    const durationFormatted = formatDuration(piece.duration);
    const praise = praises[Math.floor(Math.random() * praises.length)];
    showNotification(`检测到新曲目，时长 ${durationFormatted}<br>${praise}`);
}

// ─── 手动调整 ───

function manualAdjust(delta) {
    state.count += delta;
    if (state.count < 0) state.count = 0;

    ui.updateCounter(state.count);
    storage.saveCount();

    if (delta > 0) {
        const now = new Date();
        const piece = {
            startTime: now.toISOString(),
            endTime: now.toISOString(),
            duration: 0,
            manual: true
        };
        state.sessionLog.push(piece);
        storage.saveLog();
        ui.updateHistoryList();
    }

    ui.updateMainConsoleStats();
    ui.updateProgressBars();
    ui.updateStatistics();

    showNotification(`手动${delta > 0 ? '增加' : '减少'}曲目`);
}

// ─── 重置 / 清除 ───

function resetSession() {
    if (confirm('确定要重置本场计数吗？这将清除当前显示的计数和日志，但不会删除持久化的今日数据。')) {
        state.count = 0;
        state.sessionLog = [];

        ui.updateCounter(state.count);
        ui.updateHistoryList();
        ui.updateStatistics();
        ui.updateMainConsoleStats();
        ui.updateProgressBars();

        showNotification('已重置本场计数');
    }
}

function clearToday() {
    if (confirm('确定要清除今日所有数据吗？此操作不可恢复。')) {
        storage.clearTodayData();
        state.count = 0;
        state.sessionLog = [];

        ui.updateCounter(state.count);
        ui.updateHistoryList();
        ui.updateStatistics();
        ui.updateMainConsoleStats();
        ui.updateProgressBars();

        showNotification('已清除今日数据');
    }
}

// ─── 保存设置 ───

function saveSettings() {
    state.settings.targetCount = parseInt(ui.elements.targetCount.value) || 20;
    state.settings.targetDurationMin = parseInt(ui.elements.targetDurationMin.value) || 70;
    // mergeGap、minDuration 等滑块已通过 input 事件实时同步到 state，此处仅持久化
    storage.saveSettings();
    showNotification('设置已保存');
    ui.updateProgressBars();
}

// ─── 启动 ───
// ES Module 默认 defer，DOM 已就绪；用 readyState 做双保险

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
