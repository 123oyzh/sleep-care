// app.js
App({
  onLaunch() {
    // 展示本地存储能力
    const logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)

    // 登录
    wx.login({
      success: res => {
        // 发送 res.code 到后台换取 openId, sessionKey, unionId
      }
    })
  },
  globalData: {
    userInfo: null,
    token: null // 登录态 Token
  },

  /**
   * 设置 Token 并同步写入本地存储
   */
  setToken(token) {
    this.globalData.token = token;
    wx.setStorageSync('token', token);
  },

  /**
   * 获取 Token：优先从内存读取，其次从本地存储读取
   */
  getToken() {
    return this.globalData.token || wx.getStorageSync('token') || null;
  }
})
