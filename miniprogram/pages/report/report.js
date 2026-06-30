// pages/report/report.js — 睡眠报告页面逻辑
// 展示日期选择器 + 48段睡眠分期 ECharts 柱状图
// 编码：0=清醒(红), 1=浅睡(浅蓝), 2=深睡(深蓝), 3=REM(紫)
const echarts = require('../../components/ec-canvas/echarts');

Page({

  data: {
    selectedDate: '',   // 当前选中日期 (YYYY-MM-DD)，默认昨天
    stagesData: {},     // 睡眠分期数据 { stages: [], labels: [] }
    loading: true,      // 加载中标识
    errorMsg: '',       // 错误提示文字

    // ec-canvas 图表配置 — onInit 在 onLoad 中绑定
    ec: {}
  },

  /**
   * 页面加载 — 初始化日期为昨天，绑定图表回调，加载数据
   */
  onLoad() {
    // 默认选中昨天
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const selectedDate = [
      yesterday.getFullYear(),
      String(yesterday.getMonth() + 1).padStart(2, '0'),
      String(yesterday.getDate()).padStart(2, '0')
    ].join('-');

    // 绑定 ec.onInit — ec-canvas 组件 Canvas 就绪后自动调用
    this.setData({
      selectedDate: selectedDate,
      'ec.onInit': this._onCanvasInit.bind(this)
    });

    // 首次加载数据
    this.loadStages();
  },

  /**
   * 日期选择器变更 — 更新选中日期并重新加载数据
   */
  onDateChange(e) {
    this.setData({ selectedDate: e.detail.value });
    this.loadStages();
  },

  /**
   * GET /api/sleep/stages — 获取睡眠分期数据
   */
  loadStages() {
    const token = getApp().getToken();
    if (!token) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }

    this.setData({ loading: true, errorMsg: '' });

    wx.request({
      url: 'http://localhost:3000/api/sleep/stages',
      method: 'GET',
      data: { date: this.data.selectedDate },
      header: { 'Authorization': 'Bearer ' + token },
      success: (res) => {
        if (res.data && res.data.code === 0) {
          const { stages, labels } = res.data.data;

          // 暂存原始数据供 initChart 渲染使用
          this._stages = stages || [];
          this._labels = labels || [];

          this.setData({
            stagesData: res.data.data,
            loading: false
          });

          // 如果图表已初始化，直接渲染；否则等待 onInit 回调触发
          if (this._chart) {
            this.renderChart();
          }
        } else {
          this.setData({
            errorMsg: res.data.message || '获取分期数据失败',
            loading: false
          });
        }
      },
      fail: () => {
        this.setData({
          errorMsg: '网络请求失败，请检查网络连接',
          loading: false
        });
      }
    });
  },

  /**
   * ec-canvas Canvas 就绪回调
   * 由 ec.onInit 触发，初始化 ECharts 实例并返回
   */
  _onCanvasInit(canvas, width, height, dpr) {
    // 初始化 ECharts
    const chart = echarts.init(canvas, null, {
      width: width,
      height: height,
      devicePixelRatio: dpr
    });
    canvas.setChart(chart);
    this._chart = chart;

    // 数据已就绪则直接渲染
    if (this._stages && this._labels) {
      this.renderChart();
    }

    return chart;
  },

  /**
   * 渲染 ECharts 睡眠分期柱状图
   *
   * 编码对应颜色：
   *   0 = 清醒 → 红色   #ff6b6b
   *   1 = 浅睡 → 浅蓝   #90CAF9
   *   2 = 深睡 → 深蓝   #1565C0
   *   3 = REM  → 紫色   #7B1FA2
   */
  renderChart() {
    if (!this._chart || !this._stages || !this._labels) return;

    const stageNames = ['清醒', '浅睡', '深睡', 'REM'];
    const stageColors = ['#ff6b6b', '#90CAF9', '#1565C0', '#7B1FA2'];

    this._chart.setOption({
      tooltip: {
        trigger: 'axis',
        formatter: function (params) {
          var val = params[0].value;
          return params[0].axisValue + '\n' +
            (stageNames[val] || '未知') + ' (编码' + val + ')';
        }
      },
      grid: {
        left: '8%',
        right: '5%',
        top: '8%',
        bottom: '12%'
      },
      xAxis: {
        type: 'category',
        data: this._labels,
        axisLabel: {
          interval: 5,          // 每5个标签显示1个，避免文字重叠
          rotate: 45,
          fontSize: 10
        }
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 3,
        interval: 1,
        axisLabel: {
          formatter: function (val) {
            return stageNames[val] || '';
          }
        }
      },
      series: [{
        type: 'bar',
        // 每个柱子的颜色根据数据值 (0/1/2/3) 动态匹配
        data: this._stages.map(function (stageCode) {
          return {
            value: stageCode,
            itemStyle: {
              color: stageColors[stageCode] || '#ccc'
            }
          };
        }),
        barWidth: '80%'
      }]
    });
  }
});
