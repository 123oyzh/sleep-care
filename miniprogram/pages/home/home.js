// pages/home/home.js — 首页逻辑，加载昨日睡眠报告
Page({

  data: {
    sleepData: {},  // 睡眠报告数据（来自 /api/sleep/report/daily）
    deepRatio: 0,   // 深睡比例（%），由 deep_sleep_minutes / total_sleep_minutes 计算
    loading: true,  // 加载中标识
    errorMsg: ''    // 错误提示文字
  },

  /**
   * 页面加载 — 首次进入
   */
  onLoad() {
    this.loadReport();
  },

  /**
   * 页面显示 — 每次切换到首页都刷新数据
   */
  onShow() {
    this.loadReport();
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
  goToReport() {
    wx.navigateTo({ url: '/pages/report/report' });
  }
});
