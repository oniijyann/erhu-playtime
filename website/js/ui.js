// ui.js — 所有 DOM 操作集中于此
// 负责：DOM 缓存、事件绑定、渲染（计数器/状态/音量条/进度条/历史/统计/设备下拉/校准弹窗）

import { state } from './state.js';
import { formatDuration } from './utils.js';

// ─── DOM 元素缓存 ───

export const elements = {
    counter: document.getElementById('counter'),
    statusIndicator: document.getElementById('statusIndicator'),
    statusText: document.getElementById('statusText'),
    currentTime: document.getElementById('currentTime'),
    volumeIndicator: document.getElementById('volumeIndicator'),
    currentVolume: document.getElementById('currentVolume'),
    startThresholdLine: document.getElementById('startThresholdLine'),
    endThresholdLine: document.getElementById('endThresholdLine'),
    audioDevice: document.getElementById('audioDevice'),
    refreshDevices: document.getElementById('refreshDevices'),
    deviceStatus: document.getElementById('deviceStatus'),
    startButton: document.getElementById('startButton'),
    stopButton: document.getElementById('stopButton'),
    calibrateButton: document.getElementById('calibrateButton'),
    incrementButton: document.getElementById('incrementButton'),
    decrementButton: document.getElementById('decrementButton'),
    resetButton: document.getElementById('resetButton'),
    clearButton: document.getElementById('clearButton'),
    historyList: document.getElementById('historyList'),
    todayTotal: document.getElementById('todayTotal'),
    totalDuration: document.getElementById('totalDuration'),
    avgDuration: document.getElementById('avgDuration'),
    maxDuration: document.getElementById('maxDuration'),
    startThreshold: document.getElementById('startThreshold'),
    startThresholdValue: document.getElementById('startThresholdValue'),
    endThreshold: document.getElementById('endThreshold'),
    endThresholdValue: document.getElementById('endThresholdValue'),
    confirmTime: document.getElementById('confirmTime'),
    confirmTimeValue: document.getElementById('confirmTimeValue'),
    minDuration: document.getElementById('minDuration'),
    minDurationValue: document.getElementById('minDurationValue'),
    saveSettings: document.getElementById('saveSettings'),
    quietCalibrate: document.getElementById('quietCalibrate'),
    playingCalibrate: document.getElementById('playingCalibrate'),
    calibrationModal: document.getElementById('calibrationModal'),
    calibrationTitle: document.getElementById('calibrationTitle'),
    calibrationMessage: document.getElementById('calibrationMessage'),
    calibrationVolume: document.getElementById('calibrationVolume'),
    cancelCalibration: document.getElementById('cancelCalibration'),
    mainDurationDisplay: document.getElementById('mainDurationDisplay'),
    targetCount: document.getElementById('targetCount'),
    targetDurationMin: document.getElementById('targetDurationMin'),
    countProgressText: document.getElementById('countProgressText'),
    countProgressPercent: document.getElementById('countProgressPercent'),
    countProgressBar: document.getElementById('countProgressBar'),
    durationProgressText: document.getElementById('durationProgressText'),
    durationProgressPercent: document.getElementById('durationProgressPercent'),
    durationProgressBar: document.getElementById('durationProgressBar')
};

// ─── Tab 切换 ───

function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.querySelectorAll('.tab-content').forEach(content => content.classList.add('hidden'));
    document.getElementById(`${tabName}Tab`).classList.remove('hidden');
}

export function switchToSettingsTab() {
    switchTab('settings');
}

// ─── 事件绑定 ───
// callbacks 由 app.js 提供，ui.js 只负责 DOM 侧

export function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(button => {
        button.addEventListener('click', () => {
            switchTab(button.getAttribute('data-tab'));
        });
    });
}

export function bindEvents(callbacks) {
    elements.startButton.addEventListener('click', callbacks.onStart);
    elements.stopButton.addEventListener('click', callbacks.onStop);
    elements.calibrateButton.addEventListener('click', callbacks.onCalibrate);
    elements.refreshDevices.addEventListener('click', callbacks.onRefreshDevices);
    elements.incrementButton.addEventListener('click', callbacks.onIncrement);
    elements.decrementButton.addEventListener('click', callbacks.onDecrement);
    elements.resetButton.addEventListener('click', callbacks.onReset);
    elements.clearButton.addEventListener('click', callbacks.onClear);
    elements.saveSettings.addEventListener('click', callbacks.onSaveSettings);
    elements.quietCalibrate.addEventListener('click', callbacks.onQuietCalibrate);
    elements.playingCalibrate.addEventListener('click', callbacks.onPlayingCalibrate);
    elements.cancelCalibration.addEventListener('click', callbacks.onCancelCalibration);

    // 设置滑块
    elements.startThreshold.addEventListener('input', () => {
        const val = parseInt(elements.startThreshold.value);
        elements.startThresholdValue.textContent = `${val} dB`;
        callbacks.onStartThresholdChange(val);
    });

    elements.endThreshold.addEventListener('input', () => {
        const val = parseInt(elements.endThreshold.value);
        elements.endThresholdValue.textContent = `${val} dB`;
        callbacks.onEndThresholdChange(val);
    });

    elements.confirmTime.addEventListener('input', () => {
        const val = parseFloat(elements.confirmTime.value);
        elements.confirmTimeValue.textContent = `${val} 秒`;
        callbacks.onConfirmTimeChange(val);
    });

    elements.minDuration.addEventListener('input', () => {
        const val = parseInt(elements.minDuration.value);
        elements.minDurationValue.textContent = `${val} 秒`;
        callbacks.onMinDurationChange(val);
    });

    // 目标设置
    elements.targetCount.addEventListener('input', () => {
        callbacks.onTargetCountChange(parseInt(elements.targetCount.value));
    });

    elements.targetDurationMin.addEventListener('input', () => {
        callbacks.onTargetDurationMinChange(parseInt(elements.targetDurationMin.value));
    });
}

// ─── 渲染函数 ───

export function updateCurrentTime() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' };
    elements.currentTime.textContent = now.toLocaleDateString('zh-CN', options);
}

export function updateCounter(count) {
    elements.counter.textContent = count;
}

export function updateStatusDisplay(status) {
    switch (status) {
        case 'SILENCE':
            elements.statusIndicator.className = 'status-indicator status-silence';
            elements.statusText.textContent = '安静中';
            break;
        case 'PLAYING':
            elements.statusIndicator.className = 'status-indicator status-playing';
            elements.statusText.textContent = '演奏中...';
            break;
        case 'CONFIRM_END':
            elements.statusIndicator.className = 'status-indicator status-confirm';
            elements.statusText.textContent = '确认结束中...';
            break;
    }
}

export function updateVolumeDisplay(db, percent) {
    elements.volumeIndicator.style.width = `${percent}%`;
    elements.currentVolume.textContent = `${db.toFixed(1)} dB`;
}

export function updateThresholdLines() {
    const startPercent = ((state.settings.startThreshold + 60) / 60) * 100;
    const endPercent = ((state.settings.endThreshold + 60) / 60) * 100;
    elements.startThresholdLine.style.left = `${startPercent}%`;
    elements.endThresholdLine.style.left = `${endPercent}%`;
}

export function updateMainConsoleStats() {
    const totalSeconds = state.sessionLog.reduce((sum, piece) => sum + piece.duration, 0);
    const totalMinutes = Math.floor(totalSeconds / 60);
    const totalRemainingSeconds = Math.floor(totalSeconds % 60);
    elements.mainDurationDisplay.textContent = `${totalMinutes}分${totalRemainingSeconds}秒`;
}

export function updateProgressBars() {
    const targetCount = state.settings.targetCount || 20;
    const targetDurationMin = state.settings.targetDurationMin || 70;

    // 曲目进度
    const countPercent = Math.min(state.count / targetCount, 1) * 100;
    elements.countProgressText.textContent = `${state.count} / ${targetCount} 首`;
    elements.countProgressPercent.textContent = `${Math.round(countPercent)}%`;
    elements.countProgressBar.style.width = `${countPercent}%`;

    // 时长进度
    const totalSeconds = state.sessionLog.reduce((sum, piece) => sum + piece.duration, 0);
    const currentMinutes = Math.floor(totalSeconds / 60);
    const durationPercent = Math.min(currentMinutes / targetDurationMin, 1) * 100;
    elements.durationProgressText.textContent = `${currentMinutes} / ${targetDurationMin} 分钟`;
    elements.durationProgressPercent.textContent = `${Math.round(durationPercent)}%`;
    elements.durationProgressBar.style.width = `${durationPercent}%`;
}

export function updateHistoryList() {
    if (state.sessionLog.length === 0) {
        elements.historyList.innerHTML = '<p class="text-muted text-center py-4">暂无记录</p>';
        return;
    }

    let html = '';
    state.sessionLog.forEach((piece, index) => {
        const startTime = new Date(piece.startTime);
        const endTime = new Date(piece.endTime);
        const duration = formatDuration(piece.duration);

        html += `
            <div class="flex items-center justify-between py-2 border-b border-gray-200">
                <div class="flex items-center">
                    <span class="text-primary font-bold mr-2">${index + 1}.</span>
                    <span>${startTime.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} - ${endTime.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                </div>
                <span class="text-muted">${duration}${piece.manual ? ' (手动)' : ''}</span>
            </div>
        `;
    });

    elements.historyList.innerHTML = html;
}

export function updateStatistics() {
    elements.todayTotal.textContent = state.count;

    if (state.sessionLog.length === 0) {
        elements.totalDuration.textContent = '0分钟';
        elements.avgDuration.textContent = '0分钟';
        elements.maxDuration.textContent = '0分钟';
        return;
    }

    const totalSeconds = state.sessionLog.reduce((sum, piece) => sum + piece.duration, 0);
    const totalMinutes = Math.floor(totalSeconds / 60);
    const totalRemainingSeconds = Math.floor(totalSeconds % 60);
    elements.totalDuration.textContent = `${totalMinutes}分${totalRemainingSeconds}秒`;

    const avgSeconds = totalSeconds / state.sessionLog.length;
    const avgMinutes = Math.round(avgSeconds / 60);
    elements.avgDuration.textContent = `${avgMinutes}分钟`;

    const maxSeconds = Math.max(...state.sessionLog.map(piece => piece.duration));
    const maxMinutes = Math.round(maxSeconds / 60);
    elements.maxDuration.textContent = `${maxMinutes}分钟`;
}

// ─── 设置 UI 同步（从 state.settings → DOM）───

export function syncSettingsUI() {
    elements.startThreshold.value = state.settings.startThreshold;
    elements.startThresholdValue.textContent = `${state.settings.startThreshold} dB`;

    elements.endThreshold.value = state.settings.endThreshold;
    elements.endThresholdValue.textContent = `${state.settings.endThreshold} dB`;

    elements.confirmTime.value = state.settings.confirmTime;
    elements.confirmTimeValue.textContent = `${state.settings.confirmTime} 秒`;

    elements.minDuration.value = state.settings.minDuration;
    elements.minDurationValue.textContent = `${state.settings.minDuration} 秒`;

    elements.targetCount.value = state.settings.targetCount || 20;
    elements.targetDurationMin.value = state.settings.targetDurationMin || 70;
}

// ─── Session UI 同步 ───

export function syncSessionUI() {
    updateCounter(state.count);
    updateHistoryList();
    updateStatistics();
    updateMainConsoleStats();
    updateProgressBars();
}

// ─── 设备下拉渲染 ───

export function renderDeviceList(deviceEntries, currentSelection) {
    elements.audioDevice.innerHTML = '<option value="">请选择音频输入设备</option>';

    deviceEntries.forEach(entry => {
        const option = document.createElement('option');
        option.value = entry.deviceId;
        option.textContent = entry.label;
        if (entry.disabled) option.disabled = true;
        elements.audioDevice.appendChild(option);
    });

    // 恢复之前的选择
    if (currentSelection) {
        const exists = Array.from(elements.audioDevice.options).some(
            opt => opt.value === currentSelection
        );
        if (exists) elements.audioDevice.value = currentSelection;
    }

    // 自动选择第一个有效选项
    const realOptions = Array.from(elements.audioDevice.options).filter(
        opt => opt.value && !opt.disabled
    );
    if (!elements.audioDevice.value && realOptions.length > 0) {
        elements.audioDevice.value = realOptions[0].value;
    }

    console.log('[renderDeviceList] Final:',
        elements.audioDevice.options.length, 'options,',
        'selected:', elements.audioDevice.value);
}

// ─── 设备状态文本 ───
// type: 'error' | 'success' | 'warning'

export function updateDeviceStatus(message, type) {
    if (!message) {
        elements.deviceStatus.classList.add('hidden');
        return;
    }

    elements.deviceStatus.textContent = message;
    elements.deviceStatus.classList.remove('hidden', 'text-red-500', 'text-yellow-600', 'text-green-600');

    if (type === 'error') {
        elements.deviceStatus.classList.add('text-red-500');
    } else if (type === 'warning') {
        // 原始代码同时加了 yellow 和 green，保持一致
        elements.deviceStatus.classList.add('text-yellow-600', 'text-green-600');
    } else {
        elements.deviceStatus.classList.add('text-green-600');
    }
}

// ─── 监测按钮状态 ───

export function setMonitoringButtons(isMonitoring) {
    elements.startButton.disabled = isMonitoring;
    elements.stopButton.disabled = !isMonitoring;
    elements.audioDevice.disabled = isMonitoring;
}

// ─── 校准弹窗 ───

export function showCalibrationModal(title, message) {
    elements.calibrationTitle.textContent = title;
    elements.calibrationMessage.textContent = message;
    elements.calibrationModal.classList.remove('hidden');
}

export function hideCalibrationModal() {
    elements.calibrationModal.classList.add('hidden');
}

export function updateCalibrationMessage(message) {
    elements.calibrationMessage.textContent = message;
}

export function updateCalibrationVolume(percent) {
    elements.calibrationVolume.style.width = `${percent}%`;
}

// ─── 阈值输入同步（校准后调用）───

export function updateThresholdInputs() {
    elements.startThreshold.value = state.settings.startThreshold;
    elements.startThresholdValue.textContent = `${state.settings.startThreshold} dB`;
    elements.endThreshold.value = state.settings.endThreshold;
    elements.endThresholdValue.textContent = `${state.settings.endThreshold} dB`;
}
