// pages/login/login.js — 用户登录页面逻辑
const { BASE_URL } = require('../../utils/config');
Page({

  /**
   * 页面的初始数据
   */
  data: {
    phone: '',    // 手机号输入值
    password: ''  // 密码输入值
  },

  /**
   * 页面加载生命周期
   * 检查本地是否已有 token，有则直接跳转到设备页（免登录）
   */
  onLoad() {
    const token = getApp().getToken();
    if (token) {
      // 本地已有 token，免登录直接跳转首页
      wx.navigateTo({
        url: '/pages/home/home'
      });
    }
  },

  /**
   * 手机号输入框双向绑定
   */
  inputPhone(e) {
    this.setData({
      phone: e.detail.value
    });
  },

  /**
   * 密码输入框双向绑定
   */
  inputPassword(e) {
    this.setData({
      password: e.detail.value
    });
  },

  /**
   * 处理登录 — 校验手机号和密码后调用后台登录接口
   */
  handleLogin() {
    const { phone, password } = this.data;

    // 校验手机号不能为空
    if (!phone) {
      wx.showToast({
        title: '请输入手机号',
        icon: 'none'
      });
      return;
    }

    // 校验密码不能为空
    if (!password) {
      wx.showToast({
        title: '请输入密码',
        icon: 'none'
      });
      return;
    }

    // POST /api/auth/login — 调用后台登录接口
    wx.request({
      url: BASE_URL + '/api/auth/login',
      method: 'POST',
      header: {
        'Content-Type': 'application/json'
      },
      data: {
        phone: phone,
        password: password
      },
      success: (res) => {
        // 后台返回成功，code === 0 表示登录成功
        if (res.data && res.data.code === 0) {
          // 保存 token 到内存和本地存储
          getApp().setToken(res.data.data.token);
          // 提示登录成功
          wx.showToast({
            title: '登录成功',
            icon: 'success'
          });
          // 跳转到首页
          wx.navigateTo({
            url: '/pages/home/home'
          });
        } else {
          // 后台返回业务错误（如账号密码错误）
          wx.showToast({
            title: res.data.message || '登录失败',
            icon: 'none'
          });
        }
      },
      fail: () => {
        // 网络请求失败（如后台未启动）
        wx.showToast({
          title: '网络请求失败，请检查网络连接',
          icon: 'none'
        });
      }
    });
  }
});
