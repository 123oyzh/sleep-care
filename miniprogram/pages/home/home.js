// pages/home/home.js — 首页逻辑，加载昨日睡眠报告（含 5 分钟缓存）
Page({

  // 缓存配置
  CACHE_KEY_REPORT: 'home_report_cache',   // 睡眠报告缓存键
  CACHE_KEY_NOTES: 'home_notes_cache',     // 医生建议缓存键
  CACHE_TTL: 5 * 60 * 1000,               // 5 分钟有效期（毫秒）

  data: {
    sleepData: {},    // 睡眠报告数据（来自 /api/sleep/report/daily）
    deepRatio: 0,     // 深睡比例（%），由 deep_sleep_minutes / total_sleep_minutes 计算
    loading: true,    // 加载中标识（仅首次加载展示）
    errorMsg: '',     // 错误提示文字
    notes: [],        // 医生建议列表
    hasNotes: false,  // 是否有医生建议
    unreadCount: 0    // 未读建议数量（红点数字）
  },

  /**
   * 页面加载 — 首次进入：先读缓存，再请求
   */
  onLoad() {
    // 先尝试读缓存，有则直接渲染
    this._loadFromCache();
    // 然后请求最新数据
    this.loadReport({ forceRefresh: true });
    this.loadNotes({ forceRefresh: true });
    this.startPolling();
  },

  /**
   * 页面显示 — 每次切换回来：用缓存秒开，后台静默刷新
   */
  onShow() {
    // 已有数据则不复用缓存（onLoad 已处理），后台静默刷新
    if (this.data.sleepData.sleep_score) {
      // 有数据 → 不闪白屏，后台刷新
      this.loadReport({ forceRefresh: true });
    }
    this.loadNotes();
    this.startPolling();
  },

  /**
   * 页面隐藏 — 停止轮询，释放资源
   */
  onHide() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  },

  /**
   * 页面卸载 — 停止轮询
   */
  onUnload() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  },

  /**
   * 下拉刷新 — 用户手动下拉触发
   */
  onPullDownRefresh() {
    // 下拉强制刷新，完成后停止动画
    this.loadReport({
      forceRefresh: true,
      callback: function () { wx.stopPullDownRefresh(); }
    });
    this.loadNotes({ forceRefresh: true });
  },

  // ================================================================
  // 缓存工具方法
  // ================================================================

  /**
   * 从 localStorage 读取缓存数据，一次 setData 渲染
   */
  _loadFromCache() {
    var update = {};

    var reportCache = this._getCached(this.CACHE_KEY_REPORT);
    if (reportCache) {
      update.sleepData = reportCache.sleepData;
      update.deepRatio = reportCache.deepRatio;
      update.loading = false;
    }

    var notesCache = this._getCached(this.CACHE_KEY_NOTES);
    if (notesCache) {
      update.notes = notesCache.notes;
      update.hasNotes = notesCache.notes.length > 0;
    }

    // 合并为一次 setData
    if (Object.keys(update).length > 0) {
      this.setData(update);
    }
  },

  /**
   * 读取缓存，过期返回 null
   * 缓存格式：{ data: ..., timestamp: Date.now() }
   */
  _getCached(key) {
    try {
      var raw = wx.getStorageSync(key);
      if (!raw) return null;
      var cached = JSON.parse(raw);
      if (Date.now() - cached.timestamp < this.CACHE_TTL) {
        return cached.data;
      }
    } catch (e) { /* 缓存损坏，忽略 */ }
    return null;
  },

  /**
   * 写入缓存
   */
  _setCache(key, data) {
    try {
      wx.setStorageSync(key, JSON.stringify({
        data: data,
        timestamp: Date.now()
      }));
    } catch (e) { /* 存储空间不足，静默忽略 */ }
  },

  // ================================================================
  // API 方法
  // ================================================================

  /**
   * GET /api/sleep/report/daily — 获取昨日睡眠报告
   * @param {Object} opts — { forceRefresh: boolean, callback: Function }
   */
  loadReport(opts) {
    opts = opts || {};
    var token = getApp().getToken();

    if (!token) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }

    // 仅首次加载或无缓存时显示 loading
    if (!this.data.sleepData.sleep_score) {
      this.setData({ loading: true, errorMsg: '' });
    }

    var self = this;
    wx.request({
      url: 'http://localhost:3000/api/sleep/report/daily',
      method: 'GET',
      header: { 'Authorization': 'Bearer ' + token },
      success: function (res) {
        if (res.data && res.data.code === 0) {
          var report = res.data.data || {};
          var deepRatio = report.total_sleep_minutes > 0
            ? Math.round((report.deep_sleep_minutes / report.total_sleep_minutes) * 100)
            : 0;

          self.setData({
            sleepData: report,
            deepRatio: deepRatio,
            loading: false
          });

          // 写入缓存
          self._setCache(self.CACHE_KEY_REPORT, {
            sleepData: report,
            deepRatio: deepRatio
          });
        } else {
          self.setData({
            errorMsg: res.data.message || '获取报告失败',
            loading: false
          });
        }
      },
      fail: function () {
        self.setData({
          errorMsg: '网络请求失败，请检查网络连接',
          loading: false
        });
      },
      complete: function () {
        if (opts.callback) opts.callback();
      }
    });
  },

  /**
   * 跳转到睡眠报告页 — 查看详细分期图表
   */
  /**
   * 启动每30秒轮询检查未读建议
   */
  startPolling() {
    if (this._pollTimer) return; // 已有轮询，不重复
    this.loadNotesStatus(); // 立即执行一次
    var self = this;
    this._pollTimer = setInterval(function () {
      self.loadNotesStatus();
    }, 30000); // 每30秒
  },

  /**
   * GET /api/patient/notes/status — 轻量轮询，仅返回未读数
   */
  loadNotesStatus() {
    var token = getApp().getToken();
    if (!token) return;

    var self = this;
    wx.request({
      url: 'http://localhost:3000/api/patient/notes/status',
      method: 'GET',
      header: { 'Authorization': 'Bearer ' + token },
      success: function (res) {
        if (res.data && res.data.code === 0) {
          var d = res.data.data || {};
          var lastRead = wx.getStorageSync('note_last_read_at') || '';
          var unread = (d.latest_note_updated_at || '') > lastRead ? d.total : 0;
          self.setData({ unreadCount: unread });
        }
      },
      fail: function () {}
    });
  },

  /**
   * 跳转到医生建议通知页 — 点击后标记已读
   */
  goToNotify() {
    wx.navigateTo({ url: '/pages/notify/notify' });
  },

  /**
   * GET /api/patient/notes — 获取医生建议列表（含缓存）
   * @param {Object} opts — { forceRefresh: boolean }
   */
  loadNotes(opts) {
    opts = opts || {};
    var token = getApp().getToken();
    if (!token) return;

    var self = this;
    wx.request({
      url: 'http://localhost:3000/api/patient/notes',
      method: 'GET',
      header: { 'Authorization': 'Bearer ' + token },
      success: function (res) {
        if (res.data && res.data.code === 0) {
          var notes = res.data.data || [];
          self.setData({ notes: notes, hasNotes: notes.length > 0 });

          // 写入缓存
          self._setCache(self.CACHE_KEY_NOTES, { notes: notes });
        }
      },
      fail: function () {
        // 静默失败，医生建议是辅助功能
      }
    });
  },

  goToReport() {
    wx.navigateTo({ url: '/pages/report/report' });
  },

  /**
   * 跳转到作息设置页
   */
  goToSettings() {
    wx.navigateTo({ url: '/pages/settings/settings' });
  },

  /**
   * 跳转到医生授权页
   */
  goToDoctors() {
    wx.navigateTo({ url: '/pages/doctors/doctors' });
  }
});
