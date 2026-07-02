// pages/register/register.js — 用户注册页面逻辑
Page({

  data: {
    phone: '',
    password: '',
    nickname: ''
  },

  handleRegister() {
    var phone = this.data.phone.trim();
    var password = this.data.password.trim();
    var nickname = this.data.nickname.trim();

    if (!phone) { wx.showToast({ title: '请输入手机号', icon: 'none' }); return; }
    if (!/^\d{11}$/.test(phone)) { wx.showToast({ title: '手机号格式错误', icon: 'none' }); return; }
    if (!password || password.length < 6) { wx.showToast({ title: '密码至少6位', icon: 'none' }); return; }

    var self = this;
    wx.request({
      url: 'http://localhost:3000/api/auth/register',
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: {
        phone: phone,
        password: password,
        nickname: nickname || '用户',
        role: 'patient'  // 默认患者
      },
      success: function (res) {
        if (res.data && res.data.code === 0) {
          wx.showToast({ title: '注册成功', icon: 'success' });
          setTimeout(function () { wx.navigateBack(); }, 1500);
        } else {
          wx.showToast({ title: res.data.message || '注册失败', icon: 'none' });
        }
      },
      fail: function () {
        wx.showToast({ title: '网络请求失败', icon: 'none' });
      }
    });
  }
});
