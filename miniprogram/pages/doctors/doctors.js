// pages/doctors/doctors.js — 医生授权页面逻辑
Page({

  data: {
    doctorList: [],           // 可选医生列表
    authList: [],             // 已授权医生列表
    selectedDoctorId: null,   // 当前选中的医生 ID
    selectedDoctorName: '',   // 当前选中的医生姓名
    loading: true,            // 加载状态
    adding: false             // 授权中状态
  },

  onShow() {
    this.loadDoctors();
    this.loadAuthList();
  },

  /**
   * GET /api/users/doctors — 获取可选医生列表
   */
  loadDoctors() {
    var self = this;
    wx.request({
      url: 'http://127.0.0.1:3000/api/users/doctors',
      method: 'GET',
      success: function (res) {
        if (res.data && res.data.code === 0) {
          self.setData({ doctorList: res.data.data || [] });
        }
      },
      fail: function () {}
    });
  },

  /**
   * GET /api/doctor/granted — 获取已授权医生列表
   */
  loadAuthList() {
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
            authList: res.data.data || [],
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
   * 点击医生卡片 — 高亮选中 / 取消选中
   */
  selectDoctor(e) {
    var id = e.currentTarget.dataset.id;
    if (this.data.selectedDoctorId === id) {
      this.setData({ selectedDoctorId: null, selectedDoctorName: '' });
      return;
    }
    var list = this.data.doctorList;
    var name = '';
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) { name = list[i].nickname || ''; break; }
    }
    this.setData({ selectedDoctorId: id, selectedDoctorName: name });
  },

  /**
   * POST /api/doctor/grant — 授权选中医生（传 doctor_id）
   */
  handleAdd() {
    var token = getApp().getToken();
    if (!token) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }

    var doctorId = this.data.selectedDoctorId;
    if (!doctorId) return;

    this.setData({ adding: true });

    var self = this;
    wx.request({
      url: 'http://127.0.0.1:3000/api/doctor/grant',
      method: 'POST',
      header: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      data: { doctor_id: doctorId },
      success: function (res) {
        if (res.data && res.data.code === 0) {
          wx.showToast({ title: '授权成功', icon: 'success' });
          self.setData({
            selectedDoctorId: null,
            selectedDoctorName: '',
            adding: false
          });
          self.loadAuthList();
        } else {
          wx.showToast({ title: res.data.message || '授权失败', icon: 'none' });
          self.setData({ adding: false });
        }
      },
      fail: function () {
        wx.showToast({ title: '网络请求失败', icon: 'none' });
        self.setData({ adding: false });
      }
    });
  },

  /**
   * DELETE /api/doctor/revoke — 撤销医生授权
   */
  handleRevoke(e) {
    var token = getApp().getToken();
    if (!token) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }

    var doctorId = e.currentTarget.dataset.doctorId;

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
              self.loadAuthList();
            } else {
              wx.showToast({ title: res.data.message || '撤销失败', icon: 'none' });
            }
          },
          fail: function () {
            wx.showToast({ title: '网络请求失败', icon: 'none' });
          }
        });
      }
    });
  }
});
