// pages/report/report.js — 睡眠报告页面逻辑
// 展示日期选择器 + 48段睡眠分期柱状图 + 144点环境噪音曲线图
// 编码：0=清醒(红), 1=浅睡(浅蓝), 2=深睡(深蓝), 3=REM(紫)
const echarts = require('../../components/ec-canvas/echarts');

Page({

  data: {
    selectedDate: '',   // 当前选中日期 (YYYY-MM-DD)，默认昨天
    stagesData: {},     // 睡眠分期数据 { stages: [], labels: [] }
    noiseData: null,    // 环境噪音数据 { noise: [], labels: [] }
    loading: true,      // 加载中标识
    errorMsg: '',       // 错误提示文字

    // ec-canvas 图表配置 — onInit 在 onLoad 中绑定
    ec: {},
    noiseEc: {}         // 噪音曲线图 ec-canvas 配置
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
      'ec.onInit': this._onCanvasInit.bind(this),
      'noiseEc.onInit': this.initNoiseChart.bind(this)
    });

    // 首次加载数据
    this.loadStages();
    this.loadNoise();
  },

  /**
   * 日期选择器变更 — 同时重新加载分期和噪音数据
   */
  onDateChange(e) {
    this.setData({ selectedDate: e.detail.value });
    this.loadStages();
    this.loadNoise();
  },

  // ================================================================
  // 睡眠分期数据
  // ================================================================

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

    const self = this;
    wx.request({
      url: 'http://localhost:3000/api/sleep/stages',
      method: 'GET',
      data: { date: this.data.selectedDate },
      header: { 'Authorization': 'Bearer ' + token },
      success: function (res) {
        if (res.data && res.data.code === 0) {
          const data = res.data.data;
          self._stages = data.stages || [];
          self._labels = data.labels || [];

          self.setData({ stagesData: data, loading: false });

          // 图表已初始化则直接渲染
          if (self._chart) self.renderChart();
        } else {
          self.setData({
            errorMsg: res.data.message || '获取分期数据失败',
            loading: false
          });
        }
      },
      fail: function () {
        self.setData({
          errorMsg: '网络请求失败，请检查网络连接',
          loading: false
        });
      }
    });
  },

  /**
   * ec-canvas Canvas 就绪回调 (分期柱状图)
   * 由 ec.onInit 触发，初始化 ECharts 实例并返回
   */
  _onCanvasInit(canvas, width, height, dpr) {
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
   * 渲染睡眠分期柱状图
   * 编码对应颜色：0=清醒(#ff6b6b), 1=浅睡(#90CAF9), 2=深睡(#1565C0), 3=REM(#7B1FA2)
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
      grid: { left: '8%', right: '5%', top: '8%', bottom: '12%' },
      xAxis: {
        type: 'category',
        data: this._labels,
        axisLabel: {
          interval: 5,
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
          formatter: function (val) { return stageNames[val] || ''; }
        }
      },
      series: [{
        type: 'bar',
        data: this._stages.map(function (stageCode) {
          return {
            value: stageCode,
            itemStyle: { color: stageColors[stageCode] || '#ccc' }
          };
        }),
        barWidth: '80%'
      }]
    });
  },

  // ================================================================
  // 环境噪音数据
  // ================================================================

  /**
   * GET /api/sleep/noise — 获取环境噪音数据（144个点，24小时）
   */
  loadNoise() {
    const token = getApp().getToken();
    if (!token) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }

    const self = this;
    wx.request({
      url: 'http://localhost:3000/api/sleep/noise',
      method: 'GET',
      data: { date: this.data.selectedDate },
      header: { 'Authorization': 'Bearer ' + token },
      success: function (res) {
        if (res.data && res.data.code === 0) {
          const data = res.data.data;
          self._noiseValues = data.noise || [];
          self._noiseLabels = data.labels || [];

          self.setData({
            noiseData: { noise: self._noiseValues, labels: self._noiseLabels }
          });

          // 噪音图表已初始化则直接渲染
          if (self._noiseChart) {
            self.renderNoiseChart();
          }
        } else {
          console.warn('[report] 获取噪音数据失败:', res.data.message);
        }
      },
      fail: function () {
        console.warn('[report] 噪音数据网络请求失败');
      }
    });
  },

  /**
   * initNoiseChart — ec-canvas 噪音 Canvas 就绪回调
   * 由 noiseEc.onInit 触发，初始化 ECharts 折线图实例并返回
   */
  initNoiseChart(canvas, width, height, dpr) {
    const noiseChart = echarts.init(canvas, null, {
      width: width,
      height: height,
      devicePixelRatio: dpr
    });
    canvas.setChart(noiseChart);
    this._noiseChart = noiseChart;

    // 数据已就绪则直接渲染
    if (this._noiseValues && this._noiseLabels) {
      this.renderNoiseChart();
    }

    return noiseChart;
  },

  /**
   * 渲染环境噪音曲线图
   * 144个数据点，24小时覆盖，平滑折线 + 蓝色渐变面积填充
   * Y轴范围 20-80 dB，tooltip 显示具体数值
   */
  renderNoiseChart() {
    if (!this._noiseChart || !this._noiseValues || !this._noiseLabels) return;

    this._noiseChart.setOption({
      // tooltip — 触摸时显示具体 dB 数值
      tooltip: {
        trigger: 'axis',
        formatter: function (params) {
          return params[0].axisValue + '\n噪音: ' + params[0].value + ' dB';
        }
      },
      grid: { left: '8%', right: '5%', top: '8%', bottom: '12%' },

      // X 轴 — 24 小时时间标签
      xAxis: {
        type: 'category',
        data: this._noiseLabels,
        axisLabel: {
          interval: 11,        // 每 12 个标签显示 1 个（每 2 小时一个）
          rotate: 45,
          fontSize: 10,
          color: '#8da4c1'
        },
        axisLine: { lineStyle: { color: '#eef1f6' } }
      },

      // Y 轴 — 噪音值 20-80 dB
      yAxis: {
        type: 'value',
        name: 'dB',
        min: 20,
        max: 80,
        axisLabel: {
          color: '#8da4c1',
          fontSize: 10
        },
        splitLine: { lineStyle: { color: '#f5f7fa' } }
      },

      // 折线图 + 蓝色渐变面积填充
      series: [{
        type: 'line',
        data: this._noiseValues,
        smooth: true,          // 平滑曲线
        symbol: 'none',        // 不显示数据点标记
        lineStyle: {
          width: 2,
          color: '#4A90D9'
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(74,144,217,0.2)' },
              { offset: 1, color: 'rgba(74,144,217,0.02)' }
            ]
          }
        }
      }]
    });
  }
});
