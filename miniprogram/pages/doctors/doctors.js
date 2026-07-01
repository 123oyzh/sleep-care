// pages/doctors/doctors.js — 医生授权页面逻辑
Page({

  data: {
    doctors: [],           // 已授权医生列表
    doctorPhone: '',    // 输入框中的手机号
    loading: false,     // 加载状态
    adding: false       // 添加中状态
  },

  /**
   * 页面显示时刷新列表
   */
  onShow() {
    this.loadList();
  },

  /**
   * GET /api/doctor/granted — 获取已授权医生列表
   */
  loadList() {
    var token = getApp().getToken();
    if (!token) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }

    this.setData({ loading: true });

    var self = this;
    wx.request({
      url: 'http://127.0.0.1:3000/api/doctor/granted',
      method: 'GET',
      header: { 'Authorization': 'Bearer ' + token },
      success: function (res) {
        if (res.data && res.data.code === 0) {
          self.setData({
            doctors: res.data.data || [],
            loading: false
          });
        } else {
          wx.showToast({
            title: res.data.message || '获取列表失败',
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
   * 手机号输入框双向绑定
   */
  onPhoneInput(e) {
    this.setData({ doctorPhone: e.detail.value });
  },

  /**
   * POST /api/doctor/grant — 添加医生授权
   */
  handleAdd() {
    var token = getApp().getToken();
    if (!token) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }

    var phone = this.data.doctorPhone.trim();
    if (!phone) {
      wx.showToast({ title: '请输入医生手机号', icon: 'none' });
      return;
    }

    if (!/^\d{11}$/.test(phone)) {
      wx.showToast({ title: '手机号格式错误', icon: 'none' });
      return;
    }

    this.setData({ adding: true });

    var self = this;
    wx.request({
      url: 'http://127.0.0.1:3000/api/doctor/grant',
      method: 'POST',
      header: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      data: { doctor_phone: phone },
      success: function (res) {
        if (res.data && res.data.code === 0) {
          wx.showToast({ title: '授权成功', icon: 'success' });
          // 刷新列表 + 清空输入框
          self.setData({ doctorPhone: '', adding: false });
          self.loadList();
        } else {
          wx.showToast({
            title: res.data.message || '添加失败',
            icon: 'none'
          });
          self.setData({ adding: false });
        }
      },
      fail: function () {
        wx.showToast({
          title: '网络请求失败，请检查网络连接',
          icon: 'none'
        });
        self.setData({ adding: false });
      }
    });
  },

  /**
   * DELETE /api/doctor/revoke — 撤销医生授权
   * @param {Object} e — 事件对象，通过 e.currentTarget.dataset.doctorId 获取 doctor_id
   */
  handleRevoke(e) {
    var token = getApp().getToken();
    if (!token) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }

    var doctorId = e.currentTarget.dataset.doctorId;

    // 确认弹窗
    var self = this;
    wx.showModal({
      title: '确认撤销',
      content: '确定要撤销该医生的授权吗？',
      success: function (modalRes) {
        if (!modalRes.confirm) return;

        wx.request({
          url: 'http://127.0.0.1:3000/api/doctor/revoke',
          method: 'DELETE',
          header: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
          },
          data: { doctor_id: doctorId },
          success: function (res) {
            if (res.data && res.data.code === 0) {
              wx.showToast({ title: '已撤销', icon: 'success' });
              self.loadList();
            } else {
              wx.showToast({
                title: res.data.message || '撤销失败',
                icon: 'none'
              });
            }
          },
          fail: function () {
            wx.showToast({
              title: '网络请求失败，请检查网络连接',
              icon: 'none'
            });
          }
        });
      }
    });
  }
});
