// calibrate.js — 安静/演奏校准逻辑
// 跨模块协调：audio（dB采样）、ui（弹窗/阈值输入）、state（settings）、utils（通知）

import { state } from './state.js';
import { getCurrentDb, startMonitoring } from './audio.js';
import {
    showCalibrationModal,
    hideCalibrationModal,
    updateCalibrationMessage,
    updateCalibrationVolume,
    updateThresholdInputs,
    updateThresholdLines,
    setMonitoringButtons,
    elements
} from './ui.js';
import { showNotification } from './utils.js';

// ─── 开始校准 ───
// type: 'quiet' | 'playing'

export async function startCalibration(type) {
    // 如果未在监测，先启动
    if (!state.isMonitoring) {
        try {
            const deviceId = elements.audioDevice.value;
            if (!deviceId) {
                showNotification('请先选择音频输入设备', 'error');
                return;
            }

            await startMonitoring(deviceId);
            setMonitoringButtons(true);
            showNotification('开始监测音频');
        } catch (error) {
            console.error('Error starting monitoring for calibration:', error);
            showNotification('无法访问音频设备', 'error');
            return;
        }
    }

    if (type === 'quiet') {
        showCalibrationModal('安静校准', '请保持安静，系统正在测量环境噪音...');

        const samples = [];
        const sampleInterval = setInterval(() => {
            const db = getCurrentDb();
            samples.push(db);

            const volumePercent = ((db + 60) / 60) * 100;
            updateCalibrationVolume(volumePercent);
        }, 100);

        setTimeout(() => {
            clearInterval(sampleInterval);

            const avgDb = samples.reduce((sum, db) => sum + db, 0) / samples.length;

            state.settings.startThreshold = Math.round(avgDb + 15);
            state.settings.endThreshold = Math.round(avgDb + 5);

            updateThresholdInputs();
            updateThresholdLines();

            updateCalibrationMessage(`校准完成！环境噪音: ${avgDb.toFixed(1)} dB`);

            setTimeout(() => {
                hideCalibrationModal();
                showNotification('安静校准完成');
            }, 2000);
        }, 2000);

    } else if (type === 'playing') {
        showCalibrationModal('演奏校准', '请演奏一段中等强度的长音...');

        const samples = [];
        const sampleInterval = setInterval(() => {
            const db = getCurrentDb();
            samples.push(db);

            const volumePercent = ((db + 60) / 60) * 100;
            updateCalibrationVolume(volumePercent);
        }, 100);

        setTimeout(() => {
            clearInterval(sampleInterval);

            const avgDb = samples.reduce((sum, db) => sum + db, 0) / samples.length;

            state.settings.startThreshold = Math.round(avgDb - 10);
            state.settings.endThreshold = Math.round(avgDb - 20);

            updateThresholdInputs();
            updateThresholdLines();

            updateCalibrationMessage(`校准完成！演奏音量: ${avgDb.toFixed(1)} dB`);

            setTimeout(() => {
                hideCalibrationModal();
                showNotification('演奏校准完成');
            }, 2000);
        }, 5000);
    }
}

export function cancelCalibration() {
    hideCalibrationModal();
}
