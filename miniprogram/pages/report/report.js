// pages/report/report.js — 睡眠报告页面逻辑
// 日期选择器 + 睡眠分期柱状图 + 环境噪音曲线图 + 日周月趋势图
const { BASE_URL } = require('../../utils/config');
const echarts = require('../../components/ec-canvas/echarts');

Page({

  data: {
    selectedDate: '',     // 当前选中日期 (YYYY-MM-DD)，默认昨天
    stagesData: {},       // 睡眠分期数据 { stages: [], labels: [] }
    noiseData: null,      // 环境噪音数据 { noise: [], labels: [] }
    loading: true,        // 加载中标识
    errorMsg: '',         // 错误提示文字
    notes: [],            // 医生建议列表

    // 日周月视图切换
    currentPeriod: 'day',       // 趋势视图：day / week / month
    summaryData: null,          // 趋势图数据 { period, labels, scores, avg_score }
    summaryLoading: false,      // 趋势图加载中

    // ec-canvas 图表配置（三张独立图表）
    ec: {},          // 睡眠分期柱状图
    noiseEc: {},     // 环境噪音曲线图
    summaryEc: {}    // 趋势评分折线图
  },

  /**
   * 页面加载 — 初始化日期为昨天，绑定三张图表的 onInit 回调
   */
  onLoad() {
    var yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    var selectedDate = [
      yesterday.getFullYear(),
      String(yesterday.getMonth() + 1).padStart(2, '0'),
      String(yesterday.getDate()).padStart(2, '0')
    ].join('-');

    // 绑定三张图表的 onInit — ec-canvas Canvas 就绪后自动调用
    this.setData({
      selectedDate: selectedDate,
      'ec.onInit': this._onCanvasInit.bind(this),
      'noiseEc.onInit': this.initNoiseChart.bind(this),
      'summaryEc.onInit': this.initSummaryChart.bind(this)
    });

    // 并行加载所有数据
    this.loadStages();
    this.loadNoise();
    this.loadSummary();
    this.loadNotes();
  },

  /**
   * 日期选择器变更 — 同时重新加载所有数据
   */
  onDateChange(e) {
    this.setData({ selectedDate: e.detail.value });
    this.loadStages();
    this.loadNoise();
  },

  // ================================================================
  // 日 / 周 / 月视图切换
  // ================================================================

  /**
   * 视图切换 — 点击日/周/月视图按钮
   * 通过 data-period 传递目标视图类型 (day|week|month)
   */
  switchPeriod(e) {
    var newPeriod = e.currentTarget.dataset.period;
    if (newPeriod === this.data.currentPeriod) return;

    this.setData({ currentPeriod: newPeriod });
    this.loadSummary();
  },

  /**
   * GET /api/sleep/summary — 获取睡眠评分趋势数据
   */
  loadSummary() {
    var token = getApp().getToken();
    if (!token) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }

    this.setData({ summaryLoading: true });

    var self = this;
    wx.request({
      url: BASE_URL + '/api/sleep/summary',
      method: 'GET',
      data: {
        period: self.data.currentPeriod,
        date: self.data.selectedDate
      },
      header: { 'Authorization': 'Bearer ' + token },
      success: function (res) {
        if (res.data && res.data.code === 0) {
          var data = res.data.data;
          self._summaryLabels = data.labels || [];
          self._summaryScores = data.scores || [];
          self._summaryAvg = data.avg_score || 0;

          self.setData({
            summaryData: data,
            summaryLoading: false
          });

          // 趋势图表已初始化则直接渲染
          if (self._summaryChart) {
            self.renderSummaryChart();
          }
        } else {
          self.setData({ summaryLoading: false });
          console.warn('[report] 获取趋势数据失败:', res.data.message);
        }
      },
      fail: function () {
        self.setData({ summaryLoading: false });
        console.warn('[report] 趋势数据网络请求失败');
      }
    });
  },

  /**
   * initSummaryChart — ec-canvas 趋势图 Canvas 就绪回调
   * 由 summaryEc.onInit 触发，初始化 ECharts 折线图实例并返回
   */
  initSummaryChart(canvas, width, height, dpr) {
    var summaryChart = echarts.init(canvas, null, {
      width: width,
      height: height,
      devicePixelRatio: dpr
    });
    canvas.setChart(summaryChart);
    this._summaryChart = summaryChart;

    // 数据已就绪则直接渲染
    if (this._summaryLabels && this._summaryScores) {
      this.renderSummaryChart();
    }

    return summaryChart;
  },

  /**
   * 渲染睡眠评分趋势折线图
   * X 轴 = labels，Y 轴 = 0-100，显示数据点标记 + markLine 平均分参考线
   */
  renderSummaryChart() {
    if (!this._summaryChart || !this._summaryLabels || !this._summaryScores) return;

    this._summaryChart.setOption({
      tooltip: {
        trigger: 'axis',
        formatter: function (params) {
          return params[0].axisValue + '\n评分: ' + params[0].value + ' 分';
        }
      },
      grid: { left: '8%', right: '5%', top: '12%', bottom: '12%' },

      // X 轴 — 日期/周/月标签
      xAxis: {
        type: 'category',
        data: this._summaryLabels,
        axisLabel: {
          fontSize: 10,
          color: '#8da4c1'
        },
        axisLine: { lineStyle: { color: '#eef1f6' } }
      },

      // Y 轴 — 评分 0-100
      yAxis: {
        type: 'value',
        name: '评分',
        min: 0,
        max: 100,
        axisLabel: {
          color: '#8da4c1',
          fontSize: 10
        },
        splitLine: { lineStyle: { color: '#f5f7fa' } }
      },

      // 折线图 — 显示数据点圆形标记
      series: [{
        type: 'line',
        data: this._summaryScores,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: {
          width: 2.5,
          color: '#4A90D9'
        },
        itemStyle: {
          color: '#4A90D9',
          borderColor: '#ffffff',
          borderWidth: 2
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(74,144,217,0.15)' },
              { offset: 1, color: 'rgba(74,144,217,0.02)' }
            ]
          }
        },
        // markLine — 平均分参考线
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: {
            type: 'dashed',
            color: '#E53935',
            width: 1.5
          },
          label: {
            formatter: '平均 {c} 分',
            color: '#E53935',
            fontSize: 10
          },
          data: [{
            yAxis: this._summaryAvg,
            name: '平均分'
          }]
        }
      }]
    });
  },

  // ================================================================
  // 睡眠分期数据
  // ================================================================

  /**
   * GET /api/sleep/stages — 获取睡眠分期数据
   */
  loadStages() {
    var token = getApp().getToken();
    if (!token) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }

    this.setData({ loading: true, errorMsg: '' });

    var self = this;
    wx.request({
      url: BASE_URL + '/api/sleep/stages',
      method: 'GET',
      data: { date: this.data.selectedDate },
      header: { 'Authorization': 'Bearer ' + token },
      success: function (res) {
        if (res.data && res.data.code === 0) {
          var data = res.data.data;
          self._stages = data.stages || [];
          self._labels = data.labels || [];

          self.setData({ stagesData: data, loading: false });

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
   */
  _onCanvasInit(canvas, width, height, dpr) {
    var chart = echarts.init(canvas, null, {
      width: width, height: height, devicePixelRatio: dpr
    });
    canvas.setChart(chart);
    this._chart = chart;

    if (this._stages && this._labels) {
      this.renderChart();
    }

    return chart;
  },

  /**
   * 渲染睡眠分期柱状图
   */
  renderChart() {
    if (!this._chart || !this._stages || !this._labels) return;

    var stageNames = ['清醒', '浅睡', '深睡', 'REM'];
    var stageColors = ['#ff6b6b', '#90CAF9', '#1565C0', '#7B1FA2'];

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
        axisLabel: { interval: 5, rotate: 45, fontSize: 10 }
      },
      yAxis: {
        type: 'value', min: 0, max: 3, interval: 1,
        axisLabel: { formatter: function (val) { return stageNames[val] || ''; } }
      },
      series: [{
        type: 'bar',
        data: this._stages.map(function (sc) {
          return { value: sc, itemStyle: { color: stageColors[sc] || '#ccc' } };
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
    var token = getApp().getToken();
    if (!token) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }

    var self = this;
    wx.request({
      url: BASE_URL + '/api/sleep/noise',
      method: 'GET',
      data: { date: this.data.selectedDate },
      header: { 'Authorization': 'Bearer ' + token },
      success: function (res) {
        if (res.data && res.data.code === 0) {
          var data = res.data.data;
          self._noiseValues = data.noise || [];
          self._noiseLabels = data.labels || [];

          self.setData({
            noiseData: { noise: self._noiseValues, labels: self._noiseLabels }
          });

          if (self._noiseChart) self.renderNoiseChart();
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
   */
  initNoiseChart(canvas, width, height, dpr) {
    var noiseChart = echarts.init(canvas, null, {
      width: width, height: height, devicePixelRatio: dpr
    });
    canvas.setChart(noiseChart);
    this._noiseChart = noiseChart;

    if (this._noiseValues && this._noiseLabels) {
      this.renderNoiseChart();
    }

    return noiseChart;
  },

  /**
   * 渲染环境噪音曲线图
   */
  renderNoiseChart() {
    if (!this._noiseChart || !this._noiseValues || !this._noiseLabels) return;

    this._noiseChart.setOption({
      tooltip: {
        trigger: 'axis',
        formatter: function (params) {
          return params[0].axisValue + '\n噪音: ' + params[0].value + ' dB';
        }
      },
      grid: { left: '8%', right: '5%', top: '8%', bottom: '12%' },
      xAxis: {
        type: 'category',
        data: this._noiseLabels,
        axisLabel: { interval: 11, rotate: 45, fontSize: 10, color: '#8da4c1' },
        axisLine: { lineStyle: { color: '#eef1f6' } }
      },
      yAxis: {
        type: 'value', name: 'dB', min: 20, max: 80,
        axisLabel: { color: '#8da4c1', fontSize: 10 },
        splitLine: { lineStyle: { color: '#f5f7fa' } }
      },
      series: [{
        type: 'line',
        data: this._noiseValues,
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 2, color: '#4A90D9' },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(74,144,217,0.2)' },
              { offset: 1, color: 'rgba(74,144,217,0.02)' }
            ]
          }
        }
      }]
    });
  },

  // ================================================================
  // 医生建议
  // ================================================================

  /**
   * GET /api/patient/notes — 获取医生对自己的干预建议
   */
  loadNotes() {
    var token = getApp().getToken();
    if (!token) return;

    var self = this;
    wx.request({
      url: BASE_URL + '/api/patient/notes',
      method: 'GET',
      header: { 'Authorization': 'Bearer ' + token },
      success: function (res) {
        if (res.data && res.data.code === 0) {
          self.setData({ notes: res.data.data || [] });
        }
      },
      fail: function () {}
    });
  }
});
