// pages/home/home.js — 首页逻辑，加载昨日睡眠报告
Page({

  data: {
    sleepData: {},    // 睡眠报告数据（来自 /api/sleep/report/daily）
    deepRatio: 0,     // 深睡比例（%），由 deep_sleep_minutes / total_sleep_minutes 计算
    loading: true,    // 加载中标识
    errorMsg: '',     // 错误提示文字
    notes: [],        // 医生建议列表
    hasNotes: false,  // 是否有医生建议
    unreadCount: 0    // 未读建议数量（红点数字）
  },

  /**
   * 页面加载 — 首次进入
   */
  onLoad() {
    this.loadReport();
    this.loadNotes();
    this.startPolling();
  },

  /**
   * 页面显示 — 每次切换到首页都刷新数据 + 启动轮询
   */
  onShow() {
    this.loadReport();
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
    // 请求完成后停止下拉刷新动画
    this.loadReport(() => {
      wx.stopPullDownRefresh();
    });
  },

  /**
   * GET /api/sleep/report/daily — 获取昨日睡眠报告
   * @param {Function} callback — 请求完成后的回调（用于停止下拉刷新）
   */
  loadReport(callback) {
    const token = getApp().getToken();

    // 无 token 则跳转登录页
    if (!token) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }

    // 进入加载状态
    this.setData({ loading: true, errorMsg: '' });

    wx.request({
      url: 'http://localhost:3000/api/sleep/report/daily',
      method: 'GET',
      header: {
        'Authorization': 'Bearer ' + token
      },
      success: (res) => {
        if (res.data && res.data.code === 0) {
          const report = res.data.data || {};

          // 计算深睡比例（%）—— 数据库字段 deep_sleep_minutes / total_sleep_minutes
          const deepRatio = report.total_sleep_minutes > 0
            ? Math.round((report.deep_sleep_minutes / report.total_sleep_minutes) * 100)
            : 0;

          this.setData({
            sleepData: report,
            deepRatio: deepRatio,
            loading: false
          });
        } else {
          this.setData({
            errorMsg: res.data.message || '获取报告失败',
            loading: false
          });
        }
      },
      fail: () => {
        this.setData({
          errorMsg: '网络请求失败，请检查网络连接',
          loading: false
        });
      },
      complete: () => {
        // 无论成功或失败，都执行回调（停止下拉刷新动画）
        if (callback) callback();
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
   * GET /api/patient/notes — 获取医生建议列表
   */
  loadNotes() {
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
