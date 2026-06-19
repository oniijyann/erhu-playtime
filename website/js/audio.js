// audio.js — 音频流管理、音量计算、监测循环、状态机
// 不操作任何 DOM；通过回调向 app.js 报告音量/状态/曲目检测结果

import { state } from './state.js';

// ─── 回调注册（由 app.js 设置）───

let onVolumeUpdate = null;     // ({ db, percent }) => void
let onStatusChange = null;     // (status: 'SILENCE'|'PLAYING'|'CONFIRM_END') => void
let onPieceDetected = null;    // (piece: { startTime, endTime, duration }) => void

export function setVolumeCallback(fn) { onVolumeUpdate = fn; }
export function setStatusCallback(fn) { onStatusChange = fn; }
export function setPieceDetectedCallback(fn) { onPieceDetected = fn; }

// ─── 模块私有状态 ───

let _enumInProgress = false;
let _permissionRequested = false;

export function isPermissionRequested() { return _permissionRequested; }

// ─── 设备枚举 ───
// 返回 { deviceEntries, stream, audioInputCount, labelsExposed, isTrackFallback }
// 不操作 DOM；调用方负责渲染 <select> 和状态文本

export async function enumerateDevices(options = {}) {
    if (_enumInProgress) {
        return { deviceEntries: [], stream: null, audioInputCount: 0, labelsExposed: true, isTrackFallback: false };
    }
    _enumInProgress = true;

    let tempStream = null;

    try {
        // 首次需要请求权限以获取 device label
        if (!_permissionRequested) {
            try {
                tempStream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: false,
                        noiseSuppression: false,
                        autoGainControl: false
                    }
                });
                _permissionRequested = true;
            } catch (e) {
                console.warn('getUserMedia for enumeration failed:', e);
                _permissionRequested = true; // 标记已尝试，避免反复弹窗
            }
        }

        // 枚举所有设备
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = allDevices.filter(d => d.kind === 'audioinput');

        console.log('[audio] Raw enumerateDevices:', allDevices.length, 'total,',
            audioInputs.length, 'audio inputs.');
        audioInputs.forEach((d, i) => {
            console.log(`  [${i}] deviceId=${d.deviceId ? d.deviceId.substring(0, 8) + '...' : '(empty)'},`,
                `label=${d.label || '(empty)'}, groupId=${d.groupId ? d.groupId.substring(0, 8) + '...' : '(empty)'}`);
        });

        // 收集 tempStream 的 track label（用于回退命名）
        const trackLabels = [];
        if (tempStream) {
            tempStream.getAudioTracks().forEach(track => {
                trackLabels.push(track.label || '系统麦克风');
            });
        }

        // 构建设备条目
        const deviceEntries = [];

        if (audioInputs.length > 0) {
            audioInputs.forEach((device, index) => {
                let label = device.label;
                let deviceId = device.deviceId;
                let isFallbackId = false;
                let isTrackFallback = false;

                // label 为空时用 track label 或通用名回退
                if (!label) {
                    if (trackLabels[index]) {
                        label = trackLabels[index];
                        isTrackFallback = true;
                    } else if (trackLabels.length > 0) {
                        label = trackLabels[0] + (audioInputs.length > 1 ? ' ' + (index + 1) : '');
                        isTrackFallback = true;
                    } else {
                        label = '音频输入设备 ' + (index + 1);
                    }
                }

                // deviceId 为空时生成回退 ID
                if (!deviceId) {
                    deviceId = '__fallback__' + index;
                    isFallbackId = true;
                }

                deviceEntries.push({
                    deviceId,
                    label,
                    groupId: device.groupId,
                    isFallbackId,
                    isTrackFallback
                });
            });
        }

        // 如果枚举 API 什么都没返回，但已有活跃 stream，用 track 信息
        if (deviceEntries.length === 0 && state.mediaStream) {
            const audioTracks = state.mediaStream.getAudioTracks();
            audioTracks.forEach((track, index) => {
                const trackLabel = track.label || '系统麦克风';
                const settings = track.getSettings ? track.getSettings() : {};
                const realDeviceId = settings.deviceId || '';
                deviceEntries.push({
                    deviceId: realDeviceId || ('__track__' + trackLabel),
                    label: trackLabel + (audioTracks.length > 1 ? ' ' + (index + 1) : ''),
                    isTrackFallback: !realDeviceId
                });
            });
        }

        // 如果权限已授予但仍然没有设备，添加默认回退
        if (deviceEntries.length === 0 && _permissionRequested) {
            deviceEntries.push({
                deviceId: 'default',
                label: '系统默认麦克风'
            });
        }

        // 如果什么都没有
        if (deviceEntries.length === 0) {
            deviceEntries.push({
                deviceId: '',
                label: '未检测到音频设备 — 请点击刷新',
                disabled: true
            });
        }

        console.log('[audio] Final device entries:');
        deviceEntries.forEach((e, i) => {
            console.log(`  [${i}] deviceId=${e.deviceId ? e.deviceId.substring(0, 12) + '...' : '(empty)'},`,
                `label=${e.label}, disabled=${!!e.disabled}, isTrackFallback=${!!e.isTrackFallback}`);
        });

        // 处理 stream
        if (!options.keepStream && tempStream) {
            tempStream.getTracks().forEach(track => track.stop());
            tempStream = null;
        }

        const labelsExposed = audioInputs.length > 0 && audioInputs.every(d => d.label);
        const firstIsTrackFallback = deviceEntries[0] && deviceEntries[0].isTrackFallback;

        return {
            deviceEntries,
            stream: tempStream,
            audioInputCount: audioInputs.length,
            labelsExposed,
            isTrackFallback: firstIsTrackFallback
        };

    } catch (error) {
        console.error('[audio] enumerateDevices error:', error);
        return {
            deviceEntries: [{
                deviceId: '',
                label: '设备检测失败 — 请点击刷新重试',
                disabled: true
            }],
            stream: null,
            audioInputCount: 0,
            labelsExposed: true,
            isTrackFallback: false
        };
    } finally {
        _enumInProgress = false;
    }
}

// ─── 启动监测 ───
// getUserMedia + connectStream；不操作 DOM

export async function startMonitoring(deviceId) {
    const constraints = {
        audio: {
            deviceId: deviceId ? { exact: deviceId } : undefined,
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
        }
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    connectStream(stream);
}

// ─── 连接音频流 ───
// 设置 AudioContext / Analyser，启动 RAF 循环；不操作 DOM

export function connectStream(stream) {
    state.mediaStream = stream;
    _permissionRequested = true;

    if (!state.audioContext) {
        state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    state.analyser = state.audioContext.createAnalyser();
    state.analyser.fftSize = 2048;

    const source = state.audioContext.createMediaStreamSource(stream);
    source.connect(state.analyser);

    state.isMonitoring = true;
    monitorAudio();
}

// ─── 停止监测 ───
// 停止 track、重置音频状态；不操作 DOM

export function stopMonitoring() {
    if (state.mediaStream) {
        state.mediaStream.getTracks().forEach(track => track.stop());
        state.mediaStream = null;
    }
    state.isMonitoring = false;
    state.status = 'SILENCE';
    state.startTime = null;
    state.endTime = null;
    state.frameBelowEndThresh = 0;
    state.frameAboveStartThresh = 0;
}

// ─── 音量监测循环（RAF）───
// 计算 RMS → dB → 通过回调报告；然后跑状态机

function monitorAudio() {
    if (!state.isMonitoring) return;

    const bufferLength = state.analyser.fftSize;
    const dataArray = new Float32Array(bufferLength);
    state.analyser.getFloatTimeDomainData(dataArray);

    // RMS
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sum / bufferLength);
    const db = 20 * Math.log10(rms);
    const normalizedDb = Math.max(-60, Math.min(0, db));

    // 音量百分比
    const volumePercent = ((normalizedDb + 60) / 60) * 100;

    // 通过回调报告音量
    if (onVolumeUpdate) {
        onVolumeUpdate({ db: normalizedDb, percent: volumePercent });
    }

    // 状态机
    processAudio(normalizedDb);

    requestAnimationFrame(monitorAudio);
}

// ─── 状态机：SILENCE → PLAYING → CONFIRM_END → (曲终 / 回到 PLAYING) ───

function processAudio(db) {
    const { startThreshold, endThreshold, confirmTime, minDuration } = state.settings;
    const confirmFrames = confirmTime * 1000 / 80; // 估算帧数（≈80ms/frame）

    switch (state.status) {
        case 'SILENCE':
            if (db > startThreshold) {
                state.frameAboveStartThresh++;
                if (state.frameAboveStartThresh >= 5) {
                    state.status = 'PLAYING';
                    state.startTime = new Date();
                    state.frameAboveStartThresh = 0;
                    if (onStatusChange) onStatusChange(state.status);
                }
            } else {
                state.frameAboveStartThresh = 0;
            }
            break;

        case 'PLAYING':
            if (db < endThreshold) {
                state.frameBelowEndThresh++;
                if (state.frameBelowEndThresh >= 5) {
                    state.status = 'CONFIRM_END';
                    state.endTime = new Date();
                    state.frameBelowEndThresh = 0;
                    if (onStatusChange) onStatusChange(state.status);
                }
            } else {
                state.frameBelowEndThresh = 0;
            }
            break;

        case 'CONFIRM_END':
            if (db > startThreshold) {
                // 恢复演奏
                state.status = 'PLAYING';
                state.endTime = null;
                state.frameBelowEndThresh = 0;
                if (onStatusChange) onStatusChange(state.status);
            } else {
                state.frameBelowEndThresh++;
                if (state.frameBelowEndThresh >= confirmFrames) {
                    // 确认曲终
                    const duration = (state.endTime - state.startTime) / 1000;
                    if (duration >= minDuration) {
                        const piece = {
                            startTime: state.startTime.toISOString(),
                            endTime: state.endTime.toISOString(),
                            duration: duration
                        };
                        if (onPieceDetected) onPieceDetected(piece);
                    }
                    state.status = 'SILENCE';
                    state.startTime = null;
                    state.endTime = null;
                    state.frameBelowEndThresh = 0;
                    if (onStatusChange) onStatusChange(state.status);
                }
            }
            break;
    }
}

// ─── 读取当前 dB（校准用）───

export function getCurrentDb() {
    if (!state.analyser) return -60;

    const bufferLength = state.analyser.fftSize;
    const dataArray = new Float32Array(bufferLength);
    state.analyser.getFloatTimeDomainData(dataArray);

    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sum / bufferLength);
    const db = 20 * Math.log10(rms);
    return Math.max(-60, Math.min(0, db));
}
