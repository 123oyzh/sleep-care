// pages/devices/devices.js — 设备管理页面逻辑
Page({

  /**
   * 页面的初始数据
   */
  data: {
    devices: [] // 设备列表数组
  },

  /**
   * 页面显示时触发 — 每次显示都刷新设备列表
   */
  onShow() {
    this.loadDevices();
  },

  /**
   * 加载设备列表
   * 从后台获取当前用户绑定的所有设备，使用 SQLite 主键 id 作为设备标识
   */
  loadDevices() {
    // 从全局 getToken 方法获取 Token
    const token = getApp().getToken();
    if (!token) {
      // 无 Token，跳转回登录页
      wx.navigateTo({
       url: '/pages/login/login'
      });
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });
      return;
    }

    // GET /api/device/list — 获取设备列表
    wx.request({
      url: 'http://localhost:3000/api/device/list',
      method: 'GET',
      header: {
        'Authorization': 'Bearer ' + token
      },
      success: (res) => {
        if (res.data && res.data.code === 0) {
          // 将返回的设备数组设置到 data 中
          this.setData({
            devices: res.data.data || []
          });
        } else {
          wx.showToast({
            title: res.data.message || '获取设备列表失败',
            icon: 'none'
          });
        }
      },
      fail: () => {
        wx.showToast({
          title: '网络请求失败，请检查网络连接',
          icon: 'none'
        });
      }
    });
  },

  /**
   * 添加虚拟设备
   * POST /api/device/add — 创建一个新的虚拟设备
   */
  handleAddDevice() {
    const token = getApp().getToken();
    if (!token) {
      wx.navigateTo({
        url: '/pages/login/login'
      });
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });
      return;
    }

    // POST /api/device/add — 添加虚拟设备
    wx.request({
      url: 'http://localhost:3000/api/device/add',
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      data: {
        is_virtual: true
      },
      success: (res) => {
        if (res.data && res.data.code === 0) {
          wx.showToast({
            title: '添加成功',
            icon: 'success'
          });
          // 添加成功后刷新设备列表
          this.loadDevices();
        } else {
          wx.showToast({
            title: res.data.message || '添加设备失败',
            icon: 'none'
          });
        }
      },
      fail: () => {
        wx.showToast({
          title: '网络请求失败，请检查网络连接',
          icon: 'none'
        });
      }
    });
  },

  /**
   * 删除设备 — 根据 SQLite 主键 id 删除
   * @param {Object} e 事件对象，通过 e.currentTarget.dataset.id 获取设备 id
   */
  handleDelete(e) {
    const deviceId = e.currentTarget.dataset.id;
    const token = getApp().getToken();
    if (!token) {
      wx.navigateTo({
        url: '/pages/login/login'
      });
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });
      return;
    }

    // 二次确认，防止误删
    wx.showModal({
      title: '确认删除',
      content: '确定要删除该设备吗？',
      success: (modalRes) => {
        if (!modalRes.confirm) {
          return;
        }

        // DELETE /api/devices/:id — 删除指定设备
        wx.request({
          url: 'http://localhost:3000/api/devices/' + deviceId,
          method: 'DELETE',
          header: {
            'Authorization': 'Bearer ' + token
          },
          success: (res) => {
            if (res.data && res.data.code === 0) {
              wx.showToast({
                title: '删除成功',
                icon: 'success'
              });
              // 删除成功后刷新设备列表
              this.loadDevices();
            } else {
              wx.showToast({
                title: res.data.message || '删除设备失败',
                icon: 'none'
              });
            }
          },
          fail: () => {
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
