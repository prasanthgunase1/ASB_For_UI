import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { IconButton, Tooltip } from '@mui/material';
import PushPinIcon from '@mui/icons-material/PushPin';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';
import { MatrixController, MatrixElement } from 'chartjs-chart-matrix';
import PropTypes from 'prop-types';
import classes from './MessageChartComponent.module.scss';

// Register the Matrix components for heatmap support
Chart.register(MatrixController, MatrixElement);

/**
 * A specialized chart component for message visualizations
 * - Supports multiple chart types (pie, line, bar, scatter, etc.)
 * - Provides pin functionality for saving visualizations
 * - Handles content security policy
 * - Optimized for responsiveness in message bubbles
 */
const MessageChartComponent = ({ dataPoints, type = 'line', title = '', description = '' , isFullscreen = false}) => {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const containerRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const chartConfigRef = useRef(null);
  const chartSizeRef = useRef({ width: 0, height: 0 });
  const dataPointsRef = useRef(null);
  const resizeTimeoutRef = useRef(null);
  const animationFrameIdRef = useRef(null);

  const [isPinned, setIsPinned] = useState(false);
  const [showDescription, setShowDescription] = useState(false);
  const [chartError, setChartError] = useState(null);
  // const [chartSize, setChartSize] = useState({ width: 0, height: 0 }); // Unused state variable

  // Normalize chart type to handle various input formats
  const normalizedType = useMemo(() => {
    if (!type) return 'line';

    const typeStr = type.toString().toLowerCase().trim();

    // Map common variations to standard chart types
    const typeMap = {
      bar: 'bar',
      column: 'bar',
      barchart: 'bar',
      line: 'line',
      linechart: 'line',
      pie: 'pie',
      piechart: 'pie',
      donut: 'doughnut',
      doughnut: 'doughnut',
      scatter: 'scatter',
      scatterplot: 'scatter',
      bubble: 'bubble',
      radar: 'radar',
      polar: 'polararea',
      polararea: 'polararea',
      horizontalbar: 'horizontalbar',
      hbar: 'horizontalbar',
      heatmap: 'matrix',
    };

    return typeMap[typeStr] || 'line'; // Default to line if unknown
  }, [type]);

  // Parse the data points if they're provided as a string
  const parsedDataPoints = useMemo(() => {
    try {
      if (typeof dataPoints === 'string') {
        // return JSON.parse(dataPoints);
        return typeof dataPoints === `string`? JSON.parse(dataPoints): dataPoints;
      }
      return dataPoints;
    } catch (error) {
      console.error('Error parsing chart data:', error);
      setChartError('Failed to parse chart data');
      return null;
    }
  }, [dataPoints]);

  // Update dataPointsRef when parsedDataPoints changes
  useEffect(() => {
    dataPointsRef.current = parsedDataPoints;
  }, [parsedDataPoints]);

  // Process function strings in configuration (for tooltips, etc.)
  const processFunctionStrings = useCallback((config) => {
    if (!config) return config;

    try {
      // Deep clone the object to avoid mutations
      const processed = JSON.parse(JSON.stringify(config));

      // Process callbacks in tooltip
      if (processed.options?.plugins?.tooltip?.callbacks) {
        Object.keys(processed.options.plugins.tooltip.callbacks).forEach((callbackName) => {
          const callbackStr = processed.options.plugins.tooltip.callbacks[callbackName];
          if (typeof callbackStr === 'string' && callbackStr.startsWith('function')) {
            // Convert function string to actual function
            try {
              // processed.options.plugins.tooltip.callbacks[callbackName] = new Function('return ' + callbackStr)();
              processed.options.plugins.tooltip.callbacks[callbackName] = () => '';
            } catch (fnError) {
              console.error(`Error converting function string for ${callbackName}:`, fnError);
              // Provide a fallback function
              processed.options.plugins.tooltip.callbacks[callbackName] = () => `Error in callback: ${callbackName}`;
            }
          }
        });
      }

      // Process callbacks in other places where they might exist
      if (processed.options?.onClick && typeof processed.options.onClick === 'string') {
        try {
          // processed.options.onClick = new Function('return ' + processed.options.onClick)();
          delete processed.options.onClick;
        } catch (fnError) {
          console.error('Error converting onClick function string:', fnError);
          delete processed.options.onClick;
        }
      }

      return processed;
    } catch (error) {
      console.error('Error processing function strings:', error);
      return config;
    }
  }, []);

  // Enhanced resize handler with proper DPR support and throttling
  const handleResize = useCallback(() => {
    if (containerRef.current && canvasRef.current) {
      // Get container dimensions
      const { width, height } = containerRef.current.getBoundingClientRect();

      // Skip if dimensions haven't changed significantly
      if (Math.abs(chartSizeRef.current.width - width) < 5 && Math.abs(chartSizeRef.current.height - height) < 5) {
        return;
      }

      // Update ref immediately to prevent multiple updates
      chartSizeRef.current = { width, height };

      // Batched state update - removed unused setChartSize call
      // setChartSize({ width, height });

      // Set canvas dimensions with device pixel ratio for sharp rendering
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const dpr = window.devicePixelRatio || 1;

      // Set display size (css pixels)
      canvas.style.width = '100%';
      canvas.style.height = '100%';

      // Set actual size in memory (scaled for device pixel ratio)
      canvas.width = width * dpr;
      canvas.height = height * dpr;

      // Normalize coordinate system to use css pixels
      if (ctx) ctx.scale(dpr, dpr);

      // Resize chart if it exists (with throttling)
      if (chartRef.current) {
        chartRef.current.resize();
      }
    }
  }, []);

  // Throttled resize handler to prevent excessive updates
  const throttledResize = useCallback(() => {
    if (resizeTimeoutRef.current) {
      clearTimeout(resizeTimeoutRef.current);
    }

    resizeTimeoutRef.current = setTimeout(() => {
      handleResize();
      resizeTimeoutRef.current = null;
    }, 100); // 100ms throttle
  }, [handleResize]);

  // Compare chart configs to prevent unnecessary updates - memoized
  const configsAreEqual = useCallback((configA, configB) => {
    if (!configA || !configB) return false;

    // Simple equality check for important properties
    if (configA.type !== configB.type) return false;

    // For heatmaps, check data length
    if (configA.type === 'matrix' && configB.type === 'matrix') {
      const dataA = configA.data?.datasets?.[0]?.data;
      const dataB = configB.data?.datasets?.[0]?.data;
      if (!dataA || !dataB) return false;
      if (dataA.length !== dataB.length) return false;

      // Check a sample of values for significant changes
      const sampleSize = Math.min(5, dataA.length);
      for (let i = 0; i < sampleSize; i++) {
        const indexToCheck = Math.floor((i / sampleSize) * dataA.length);
        if (dataA[indexToCheck]?.v !== dataB[indexToCheck]?.v) {
          return false;
        }
      }
    }

    return true;
  }, []);

  // Get Chart Configuration - Memoized
  const getChartConfig = useCallback(() => {
    if (!dataPointsRef.current) return null;

    // Process function strings for tooltips
    const processedConfig = processFunctionStrings(dataPointsRef.current);

    // If a complete chart config is provided, use it directly
    if (processedConfig.type && processedConfig.data) {
      // If a complete chart config is provided, make sure to normalize the type
      return {
        ...processedConfig,
        type: processedConfig.type === 'heatmap' ? 'matrix' : processedConfig.type,
      };
    }

    // Otherwise, construct the chart config based on the provided type and data
    const chartType = normalizedType;

    // Adjust options based on container size
    const isSmallContainer = chartSizeRef.current.width < 300 || chartSizeRef.current.height < 200;
    const isTinyContainer = chartSizeRef.current.width < 200 || chartSizeRef.current.height < 150;

    // Default config based on chart type
    switch (chartType) {
      case 'heatmap':
        return {
          type: 'matrix',
          data: {
            datasets: [
              {
                label: processedConfig.datasets?.[0]?.label || 'Heatmap',
                data: (() => {
                  // For a proper heatmap/matrix chart, we need {x, y, v} format data points
                  const result = [];

                  // Extract data from the chart config
                  const labels = processedConfig.labels || [];
                  const dataSet = processedConfig.datasets?.[0];
                  const values = dataSet?.data || [];

                  // If the data is already in {x, y, v} format, use it directly
                  if (values.length > 0 && typeof values[0] === 'object' && 'x' in values[0] && 'v' in values[0]) {
                    return values;
                  }

                  // If the data is an array of numbers, create heatmap data
                  // Using market ID as y-axis value or fallback to "Value"
                  const yLabel = dataSet?.label || 'Market';

                  // Create data points for each value
                  labels.forEach((label, i) => {
                    result.push({
                      x: label,
                      y: yLabel,
                      v: values[i] || 0,
                    });
                  });

                  return result;
                })(),
                backgroundColor: (ctx) => {
                  // Make sure we have valid data for this index
                  if (!ctx.dataset.data[ctx.dataIndex]) return 'rgba(0, 0, 0, 0.1)';

                  const value = ctx.dataset.data[ctx.dataIndex].v;

                  // Get min/max for proper scaling
                  const values = ctx.dataset.data.map((d) => d.v);
                  const min = Math.min(...values);
                  const max = Math.max(...values);
                  const range = max - min;

                  // Calculate color intensity based on value's position in the range
                  const normalized = range === 0 ? 0.5 : (value - min) / range;

                  // Create a visually pleasing gradient (blue to red)
                  const r = Math.round(255 * normalized);
                  const g = Math.round(100 - 50 * normalized);
                  const b = Math.round(255 * (1 - normalized));

                  return `rgba(${r}, ${g}, ${b}, 0.85)`;
                },
                hoverBackgroundColor: (ctx) => {
                  if (!ctx.dataset.data[ctx.dataIndex]) return 'rgba(0, 0, 0, 0.2)';

                  const value = ctx.dataset.data[ctx.dataIndex].v;
                  const values = ctx.dataset.data.map((d) => d.v);
                  const min = Math.min(...values);
                  const max = Math.max(...values);
                  const range = max - min;
                  const normalized = range === 0 ? 0.5 : (value - min) / range;

                  // Brighter version of the color for hover state
                  const r = Math.round(255 * normalized);
                  const g = Math.round(100 - 50 * normalized);
                  const b = Math.round(255 * (1 - normalized));

                  return `rgba(${r}, ${g}, ${b}, 1.0)`;
                },
                borderColor: 'rgba(255, 255, 255, 0.5)',
                borderWidth: 1,
                width: ({ chart }) => {
                  const chartWidth = chart.chartArea.width;
                  const count = processedConfig.labels?.length || 1;
                  // Leave a little space between cells
                  return Math.max(chartWidth / count - 2, 15);
                },
                height: ({ chart }) => {
                  // For single row, use a fixed height
                  return Math.min(chart.chartArea.height - 4, 40);
                },
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false, // Disable animation for heatmaps to improve performance
            layout: {
              padding: {
                top: 10,
                right: 10,
                bottom: 15,
                left: 10,
              },
            },
            plugins: {
              legend: {
                display: true,
                position: 'bottom',
                align: 'start',
                labels: {
                  boxWidth: 15,
                  usePointStyle: false,
                  generateLabels: (chart) => {
                    // Create custom legend with color gradient
                    const datasets = chart.data.datasets;
                    if (!datasets.length) return [];

                    const data = datasets[0].data || [];
                    if (!data.length) return [];

                    // Get min and max values
                    const values = data.map((d) => d.v);
                    const min = Math.min(...values);
                    const max = Math.max(...values);

                    // Create gradient legend
                    return [
                      {
                        text: `Min: $${min.toFixed(2)}`,
                        fillStyle: 'rgba(0, 100, 255, 0.85)',
                        strokeStyle: 'rgba(0, 100, 255, 0.85)',
                        lineWidth: 0,
                      },
                      {
                        text: `Max: $${max.toFixed(2)}`,
                        fillStyle: 'rgba(255, 50, 0, 0.85)',
                        strokeStyle: 'rgba(255, 50, 0, 0.85)',
                        lineWidth: 0,
                      },
                    ];
                  },
                },
              },
              tooltip: {
                callbacks: {
                  title: (ctx) => {
                    if (ctx.length > 0) {
                      return `${ctx[0].dataset.label || 'PPG'}: ${ctx[0].raw.x || ''}`;
                    }
                    return '';
                  },
                  label: (ctx) => {
                    const d = ctx.raw;
                    if (d) {
                      return `Value: $${d.v.toFixed(2)}`;
                    }
                    return '';
                  },
                  afterLabel: (ctx) => {
                    const value = ctx.raw?.v || 0;
                    const values = ctx.dataset.data.map((d) => d.v);
                    const min = Math.min(...values);
                    const max = Math.max(...values);

                    if (value === max) {
                      return '(Highest value)';
                    } else if (value === min) {
                      return '(Lowest value)';
                    }
                    return '';
                  },
                },
                displayColors: true,
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                padding: 8,
                cornerRadius: 4,
                titleFont: {
                  size: 14,
                  weight: 'bold',
                },
                bodyFont: {
                  size: 13,
                },
              },
              title: processedConfig.options?.plugins?.title || {
                display: true,
                text: 'Base Price Heatmap by PPG',
                font: {
                  size: 16,
                  weight: 'bold',
                },
                padding: {
                  bottom: 15,
                },
              },
            },
            scales: {
              x: {
                type: 'category',
                position: 'bottom',
                offset: true,
                labels: processedConfig.labels || [],
                grid: {
                  display: true,
                  color: 'rgba(0, 0, 0, 0.05)',
                },
                ticks: {
                  display: true,
                  padding: 8,
                  font: {
                    size: isTinyContainer ? 9 : isSmallContainer ? 10 : 11,
                  },
                  color: '#333',
                  maxRotation: 45,
                  minRotation: 0,
                },
                title: {
                  display: true,
                  text: 'PPG',
                  font: {
                    size: 12,
                    weight: 'bold',
                  },
                  padding: { top: 5, bottom: 10 },
                },
              },
              y: {
                type: 'category',
                position: 'left',
                offset: true,
                labels: [processedConfig.datasets?.[0]?.label || 'Market Value'],
                grid: {
                  display: false,
                },
                ticks: {
                  display: true,
                  padding: 8,
                  font: {
                    size: isTinyContainer ? 9 : isSmallContainer ? 10 : 11,
                  },
                  color: '#333',
                },
                title: {
                  display: true,
                  text: 'Market',
                  font: {
                    size: 12,
                    weight: 'bold',
                  },
                  padding: { top: 0, bottom: 0, left: 0, right: 10 },
                },
              },
            },
          },
        };

      // Other chart types follow - keeping your existing implementations
      case 'pie':
      case 'doughnut':
        return {
          type: chartType,
          data: processedConfig,
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                display: chartSizeRef.current.width > 150,
                position: 'bottom',
                labels: {
                  boxWidth: isSmallContainer ? 8 : 12,
                  font: {
                    size: isTinyContainer ? 8 : isSmallContainer ? 9 : 11,
                    family: "'Inter', sans-serif",
                  },
                  padding: isSmallContainer ? 5 : 10,
                },
              },
              tooltip: {
                titleFont: {
                  size: isSmallContainer ? 10 : 12,
                  family: "'Inter', sans-serif",
                },
                bodyFont: {
                  size: isSmallContainer ? 9 : 11,
                  family: "'Inter', sans-serif",
                },
                callbacks: {
                  label: function (context) {
                    const label = context.label || '';
                    const value = context.formattedValue;
                    return `${label}: ${value}`;
                  },
                },
              },
            },
          },
        };

      case 'bar':
        return {
          type: chartType,
          data: processedConfig,
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
              duration: 300, // Shorter animation duration
            },
            plugins: {
              legend: {
                display:
                  chartSizeRef.current.width > 200 && processedConfig.datasets && processedConfig.datasets.length > 1,
                position: 'bottom',
                labels: {
                  boxWidth: isSmallContainer ? 8 : 12,
                  font: {
                    size: isTinyContainer ? 8 : isSmallContainer ? 9 : 11,
                    family: "'Inter', sans-serif",
                  },
                  padding: isSmallContainer ? 5 : 10,
                },
              },
              tooltip: {
                titleFont: {
                  size: isSmallContainer ? 10 : 12,
                  family: "'Inter', sans-serif",
                },
                bodyFont: {
                  size: isSmallContainer ? 9 : 11,
                  family: "'Inter', sans-serif",
                },
              },
            },
            scales: {
              x: {
                ticks: {
                  font: {
                    size: isTinyContainer ? 8 : isSmallContainer ? 9 : 10,
                    family: "'Inter', sans-serif",
                  },
                  maxRotation: isSmallContainer ? 45 : 0,
                  minRotation: 0,
                  autoSkip: true,
                  maxTicksLimit: isSmallContainer ? 5 : 8,
                },
                grid: {
                  display: !isSmallContainer,
                },
              },
              y: {
                beginAtZero: true,
                ticks: {
                  font: {
                    size: isTinyContainer ? 8 : isSmallContainer ? 9 : 10,
                    family: "'Inter', sans-serif",
                  },
                  maxTicksLimit: isSmallContainer ? 4 : 6,
                },
                grid: {
                  color: 'rgba(0, 0, 0, 0.05)',
                  display: !isTinyContainer,
                },
              },
            },
          },
        };

      case 'horizontalbar':
        return {
          type: 'bar',
          data: processedConfig,
          options: {
            indexAxis: 'y', // This makes the bar chart horizontal
            responsive: true,
            maintainAspectRatio: false,
            animation: {
              duration: 300,
            },
            plugins: {
              legend: {
                display:
                  chartSizeRef.current.width > 200 && processedConfig.datasets && processedConfig.datasets.length > 1,
                position: 'bottom',
                labels: {
                  boxWidth: isSmallContainer ? 8 : 12,
                  font: {
                    size: isTinyContainer ? 8 : isSmallContainer ? 9 : 11,
                    family: "'Inter', sans-serif",
                  },
                  padding: isSmallContainer ? 5 : 10,
                },
              },
              tooltip: {
                titleFont: {
                  size: isSmallContainer ? 10 : 12,
                  family: "'Inter', sans-serif",
                },
                bodyFont: {
                  size: isSmallContainer ? 9 : 11,
                  family: "'Inter', sans-serif",
                },
              },
            },
            scales: {
              x: {
                beginAtZero: true,
                ticks: {
                  font: {
                    size: isTinyContainer ? 8 : isSmallContainer ? 9 : 10,
                    family: "'Inter', sans-serif",
                  },
                  maxTicksLimit: isSmallContainer ? 4 : 6,
                },
                grid: {
                  color: 'rgba(0, 0, 0, 0.05)',
                  display: !isTinyContainer,
                },
              },
              y: {
                ticks: {
                  font: {
                    size: isTinyContainer ? 8 : isSmallContainer ? 9 : 10,
                    family: "'Inter', sans-serif",
                  },
                  autoSkip: true,
                  maxTicksLimit: isSmallContainer ? 5 : 8,
                },
                grid: {
                  display: false,
                },
              },
            },
          },
        };

      // Default case (line chart)
      default:
        return {
          type: normalizedType,
          data: processedConfig,
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
              duration: 300,
            },
            plugins: {
              legend: {
                display: chartSizeRef.current.width > 200,
                position: 'bottom',
                labels: {
                  boxWidth: isSmallContainer ? 8 : 12,
                  font: {
                    size: isTinyContainer ? 8 : isSmallContainer ? 9 : 11,
                    family: "'Inter', sans-serif",
                  },
                  padding: isSmallContainer ? 5 : 10,
                },
              },
              tooltip: {
                titleFont: {
                  size: isSmallContainer ? 10 : 12,
                  family: "'Inter', sans-serif",
                },
                bodyFont: {
                  size: isSmallContainer ? 9 : 11,
                  family: "'Inter', sans-serif",
                },
              },
            },
            scales: {
              x: {
                ticks: {
                  font: {
                    size: isTinyContainer ? 8 : isSmallContainer ? 9 : 10,
                    family: "'Inter', sans-serif",
                  },
                  maxRotation: isSmallContainer ? 45 : 0,
                  autoSkip: true,
                  maxTicksLimit: isSmallContainer ? 5 : 8,
                },
                grid: {
                  display: !isSmallContainer,
                },
              },
              y: {
                beginAtZero: false,
                ticks: {
                  font: {
                    size: isTinyContainer ? 8 : isSmallContainer ? 9 : 10,
                    family: "'Inter', sans-serif",
                  },
                  maxTicksLimit: isSmallContainer ? 4 : 6,
                },
                grid: {
                  color: 'rgba(0, 0, 0, 0.05)',
                  display: !isTinyContainer,
                },
              },
            },
            elements: {
              line: {
                tension: 0.4,
                borderWidth: isSmallContainer ? 1.5 : 2,
              },
              point: {
                radius: isTinyContainer ? 1.5 : isSmallContainer ? 2 : 3,
                hoverRadius: isTinyContainer ? 3 : isSmallContainer ? 4 : 5,
              },
            },
          },
        };
    }
  }, [normalizedType, processFunctionStrings]);

  // Toggle pin status
  const handleTogglePin = useCallback(() => {
    setIsPinned((prev) => !prev);
  }, []);

  // Setup ResizeObserver for responsive charts
  useEffect(() => {
    if (!containerRef.current) return;

    // Initial size measurement
    handleResize();

    // Create ResizeObserver with throttling
    resizeObserverRef.current = new ResizeObserver(() => {
      throttledResize();
    });

    // Start observing container
    resizeObserverRef.current.observe(containerRef.current);

    // Also listen to window resize for layout shifts
    window.addEventListener('resize', throttledResize);

    // Clean up
    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
      window.removeEventListener('resize', throttledResize);
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
    };
  }, [handleResize, throttledResize]);

  // Initialize and update chart
  useEffect(() => {
    // Skip if refs are not ready
    if (!canvasRef.current || !dataPointsRef.current) return;

    // Get chart configuration
    const chartConfig = getChartConfig();

    // Skip if no valid config
    if (!chartConfig) return;

    // Skip if nothing changed significantly
    if (chartRef.current && configsAreEqual(chartConfig, chartConfigRef.current)) {
      return;
    }

    // Store config for comparison
    chartConfigRef.current = chartConfig;

    // Clear any previous chart
    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    try {
      // Get the rendering context
      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) {
        setChartError('Canvas context not available');
        return;
      }

      // Clear any previous errors
      setChartError(null);

      // Special handling for matrix charts - completely disable animation
      if (chartConfig.type === 'matrix') {
        chartConfig.options = chartConfig.options || {};
        chartConfig.options.animation = false;
      }

      // Important: Add responsive: true and maintainAspectRatio: false for stable sizing
      if (chartConfig.options) {
        chartConfig.options.responsive = true;
        chartConfig.options.maintainAspectRatio = false;

        // Override onResize handler to prevent chart.js from triggering resizes
        chartConfig.options.onResize = () => {
          // Do nothing - we handle resize ourselves
        };
      }

      // Create new chart instance
      chartRef.current = new Chart(ctx, chartConfig);

      // Initial resize with delay to ensure proper rendering
      setTimeout(() => {
        if (chartRef.current) {
          chartRef.current.resize();
        }
      }, 50);
    } catch (error) {
      console.error('Error creating chart:', error);
      setChartError(`Failed to create chart: ${error.message}`);
    }
  }, [parsedDataPoints, getChartConfig, configsAreEqual]);

  return (
    <div
    className={`${classes.messageChartContainer} ${isPinned ? classes.pinned : ''} ${
      isFullscreen ? classes.fullscreen : ''
    }`}
      ref={containerRef}
      data-chart-type={normalizedType}>
      {title && (
        <div className={classes.chartHeader}>
          <h4 className={classes.chartTitle}>{title}</h4>

          <div className={classes.chartActions}>
            {description && (
              <Tooltip
                title={description}
                open={showDescription}
                onOpen={() => setShowDescription(true)}
                onClose={() => setShowDescription(false)}
                arrow>
                <IconButton
                  size="small"
                  className={classes.infoButton}
                  onClick={() => setShowDescription(!showDescription)}>
                  <InfoOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}

            <IconButton
              size="small"
              onClick={handleTogglePin}
              className={`${classes.pinButton} ${isPinned ? classes.pinActive : ''}`}
              aria-label={isPinned ? 'Unpin chart' : 'Pin chart'}>
              <PushPinIcon fontSize="small" />
            </IconButton>
          </div>
        </div>
      )}

      <div className={classes.chartWrapper}>
        {chartError ? (
          <div className={classes.chartError}>
            <p>{chartError}</p>
          </div>
        ) : parsedDataPoints ? (
          <canvas ref={canvasRef} className={classes.chartCanvas} />
        ) : (
          <div className={classes.chartLoading}>
            <p>Loading chart data...</p>
          </div>
        )}
      </div>
    </div>
  );
};

MessageChartComponent.propTypes = {
  dataPoints: PropTypes.object.isRequired,
  type: PropTypes.string,
  title: PropTypes.string,
  description: PropTypes.string,
};

export default MessageChartComponent;
