// pages/settings/settings.js — 作息设置页面逻辑
Page({

  data: {
    bedTime: '',          // 就寝时间 "HH:mm"
    wakeTime: '',         // 起床时间 "HH:mm"
    sunriseDuration: 10,  // 日出模拟时长（分钟）
    loading: false,       // 加载状态
    saving: false         // 保存状态
  },

  /**
   * 页面加载 — 获取当前作息设置
   */
  onLoad() {
    this.loadSettings();
  },

  /**
   * GET /api/setting/plan — 获取当前用户的作息设置
   */
  loadSettings() {
    var token = getApp().getToken();
    if (!token) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }

    this.setData({ loading: true });

    var self = this;
    wx.request({
      url: 'http://127.0.0.1:3000/api/setting/plan',
      method: 'GET',
      header: { 'Authorization': 'Bearer ' + token },
      success: function (res) {
        if (res.data && res.data.code === 0) {
          var s = res.data.data || {};
          self.setData({
            bedTime: s.bedTime || '',
            wakeTime: s.wakeTime || '',
            sunriseDuration: s.sunriseDuration || 10,
            loading: false
          });
        } else {
          wx.showToast({
            title: res.data.message || '获取设置失败',
            icon: 'none'
          });
          self.setData({ loading: false });
        }
      },
      fail: function () {
        wx.showToast({
          title: '网络请求失败，请检查网络连接',
          icon: 'none'
        });
        self.setData({ loading: false });
      }
    });
  },

  /**
   * 就寝时间变更 — 从 e.detail.value 获取 HH:mm 更新 bedTime
   */
  onBedTimeChange(e) {
    this.setData({ bedTime: e.detail.value });
  },

  /**
   * 起床时间变更 — 更新 wakeTime
   */
  onWakeTimeChange(e) {
    this.setData({ wakeTime: e.detail.value });
  },

  /**
   * 日出模拟时长 slider 变更 — 更新 sunriseDuration
   */
  onSunriseChange(e) {
    this.setData({ sunriseDuration: e.detail.value });
  },

  /**
   * PUT /api/setting/plan — 保存作息设置
   */
  saveSettings() {
    var token = getApp().getToken();
    if (!token) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }

    this.setData({ saving: true });

    var self = this;
    wx.request({
      url: 'http://127.0.0.1:3000/api/setting/plan',
      method: 'PUT',
      header: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      data: {
        bedTime: self.data.bedTime,
        wakeTime: self.data.wakeTime,
        sunriseDuration: self.data.sunriseDuration
      },
      success: function (res) {
        if (res.data && res.data.code === 0) {
          wx.showToast({ title: '保存成功', icon: 'success' });
        } else {
          wx.showToast({
            title: res.data.message || '保存失败',
            icon: 'none'
          });
        }
        self.setData({ saving: false });
      },
      fail: function () {
        wx.showToast({
          title: '网络请求失败，请检查网络连接',
          icon: 'none'
        });
        self.setData({ saving: false });
      }
    });
  },

  /**
   * 返回上一页
   */
  goBack() {
    wx.navigateBack();
  }
});
