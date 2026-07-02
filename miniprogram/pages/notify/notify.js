// pages/notify/notify.js — 医生建议通知页
const { BASE_URL } = require('../../utils/config');
Page({

  data: {
    notes: [],     // 建议列表
    loading: true
  },

  onLoad() {
    this.loadNotes();
    // 标记已读 — 红点消失
    this._markRead();
  },

  /**
   * GET /api/patient/notes — 获取所有医生建议
   */
  loadNotes() {
    var token = getApp().getToken();
    if (!token) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }

    this.setData({ loading: true });

    var self = this;
    wx.request({
      url: BASE_URL + '/api/patient/notes',
      method: 'GET',
      header: { 'Authorization': 'Bearer ' + token },
      success: function (res) {
        if (res.data && res.data.code === 0) {
          self.setData({
            notes: res.data.data || [],
            loading: false
          });
        } else {
          self.setData({ loading: false });
        }
      },
      fail: function () {
        self.setData({ loading: false });
      }
    });
  },

  /**
   * 标记已读 — 写入 localStorage，首页红点消失
   */
  _markRead() {
    var now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    wx.setStorageSync('note_last_read_at', now);
  },

  /**
   * 点击卡片 → 跳转报告页
   */
  goToReport() {
    wx.navigateTo({ url: '/pages/report/report' });
  }
});
