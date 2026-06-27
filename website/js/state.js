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

    // 状态机时间戳（替代原帧计数，避免后台节流导致计时失真）
    aboveStartSince: null,   // SILENCE：首次过 startThreshold 的时间
    belowEndSince: null,     // PLAYING：首次低于 endThreshold 的时间
    endConfirmSince: null,   // CONFIRM_END：进入确认的时间

    // 滑动窗口：覆盖率门控用，每项 { t, aboveStart, belowEnd }
    dbHistory: [],

    // 可调参数
    settings: {
        startThreshold: -35,   // dB
        endThreshold: -45,     // dB
        confirmTime: 3,        // seconds
        minDuration: 20,       // seconds
        mergeGap: 0,           // seconds — 间隔小于此值则合并为同一首（间奏容忍）
        targetCount: 20,
        targetDurationMin: 70, // minutes

        // L1：开始确认覆盖率门控（防单次误触发）
        startCoverageEnabled: true,
        startCoverageWindow: 2,   // seconds
        startCoverageRatio: 70,   // %

        // L3：演奏保持覆盖率门控（防连续误判为长曲）
        playingCoverageEnabled: true,
        playingCoverageWindow: 5, // seconds
        playingCoverageRatio: 50  // %
    }
};
