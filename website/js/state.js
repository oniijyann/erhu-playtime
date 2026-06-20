// state.js — 全局状态对象（单例）
// 所有模块共享的 mutable state，无任何逻辑

export const state = {
    count: 0,
    status: 'SILENCE', // SILENCE | PLAYING | CONFIRM_END
    startTime: null,
    endTime: null,
    sessionLog: [],

    // 音频管线
    audioContext: null,
    analyser: null,
    mediaStream: null,
    isMonitoring: false,

    // 状态机帧计数
    frameBelowEndThresh: 0,
    frameAboveStartThresh: 0,

    // 可调参数
    settings: {
        startThreshold: -35,   // dB
        endThreshold: -45,     // dB
        confirmTime: 3,        // seconds
        minDuration: 20,       // seconds
        mergeGap: 0,          // seconds — 间隔小于此值则合并为同一首（间奏容忍）
        targetCount: 20,
        targetDurationMin: 70  // minutes
    }
};
