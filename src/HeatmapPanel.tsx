import React, { useState } from 'react';
import { TimeRange, Field, PanelProps, ThresholdsMode, ThresholdsConfig } from '@grafana/data';
import { useTheme } from '@grafana/ui';

import { bucketize } from './bucket';
import { HeatmapOptions } from './types';
import { makeSpectrumColorScale, makeCustomColorScale } from './colors';
import { TimeRegion } from './TimeRegionEditor';

import { HeatmapChart } from './components/HeatmapChart';
import { Legend } from './components/Legend';

interface Props extends PanelProps<HeatmapOptions> {}

/**
 * HeatmapPanel visualizes a heatmap with a histogram for each day along with
 * axes and a legend.
 *
 * A panel is a regular React component that accepts a `Props` that extends
 * `PanelProps`. The `PanelProps` object gives your component access to things
 * like query results, panel options, and the current timezone.
 */
export const HeatmapPanel: React.FC<Props> = ({ options, data, width, height, timeZone, timeRange }) => {
  const { valueFieldName, timeFieldName } = options;

  // `options` contains the properties defined in the `HeatmapOptions` object.
  const { regions, showLegend, showValueIndicator, from, to } = options;

  // Parse the extents of hours to display in a day.
  const dailyIntervalHours: [number, number] = [parseFloat(from), to === '0' ? 24 : parseFloat(to)];

  const theme = useTheme();

  return (
    <svg width={width} height={height}>
      {data.series.map((frame, i) => {
        const segmentHeight = height / data.series.length;

        // Use the first temporal field.
        const timeField = frame.fields.find(f => f.name === timeFieldName) ?? frame.fields.find(f => f.type === 'time');
        if (!timeField) {
          return (
            <text
              style={{ fill: theme.colors.text }}
              x={width / 2 - measureText('Select a time dimension') / 2}
              y={i * segmentHeight + segmentHeight / 2}
            >
              Select a time dimension
            </text>
          );
        }

        // Use the first numeric field.
        const valueField =
          frame.fields.find(f => f.name === valueFieldName) ?? frame.fields.find(f => f.type === 'number');
        if (!valueField) {
          return (
            <text
              style={{ fill: theme.colors.text }}
              x={width / 2 - measureText('Select a value dimension') / 2}
              y={i * segmentHeight + segmentHeight / 2}
            >
              Select a value dimension
            </text>
          );
        }

        return (
          <g key={i} transform={`translate(0, ${i * segmentHeight})`}>
            <HeatmapContainer
              width={width}
              height={segmentHeight}
              showLegend={showLegend}
              timeField={timeField}
              valueField={valueField}
              timeZone={timeZone}
              timeRange={timeRange}
              dailyIntervalHours={dailyIntervalHours}
              regions={regions ?? []}
              showValueIndicator={showValueIndicator}
            />
          </g>
        );
      })}
    </svg>
  );
};

interface HeatmapContainerProps {
  width: number;
  height: number;

  showLegend: boolean;
  showValueIndicator: boolean;
  timeField: Field<number>;
  valueField: Field<number>;
  timeZone: string;
  timeRange: TimeRange;
  dailyIntervalHours: [number, number];
  regions: TimeRegion[];
}

/**
 * HeatmapContainer is used to support multiple queries. A HeatmapContainer is
 * created for each query.
 */
export const HeatmapContainer: React.FC<HeatmapContainerProps> = ({
  width,
  height,
  showLegend,
  timeField,
  valueField,
  timeZone,
  timeRange,
  dailyIntervalHours,
  regions,
  showValueIndicator,
}) => {
  const [showTriangle, setShowTriangle] = useState<number | undefined>();

  // Create a histogram for each day. This builds the main data structure that
  // we'll use for the heatmap visualization.
  const bucketData = bucketize(timeField, valueField, timeZone, timeRange, dailyIntervalHours);

  // Get custom fields options. For now, we use the configuration in the first
  // numeric field in the data frame.
  const fieldConfig = valueField.config.custom;
  const colorPalette = fieldConfig.colorPalette;
  const invertPalette = fieldConfig.invertPalette;
  const colorSpace = fieldConfig.colorSpace;
  const thresholds: ThresholdsConfig = fieldConfig.thresholds ?? {
    mode: ThresholdsMode.Percentage,
    steps: [],
  };

  // Create the scale we'll be using to map values to colors.
  const customColorScale = makeCustomColorScale(colorSpace, bucketData.min, bucketData.max, thresholds);
  const spectrumColorScale = makeSpectrumColorScale(colorPalette, bucketData.min, bucketData.max, invertPalette);

  const colorDisplay = (value: number): string => {
    switch (colorPalette) {
      case 'custom':
        return customColorScale(value);
      case 'fieldOptions':
        return valueField.display!(value).color!;
      default:
        return spectrumColorScale(value);
    }
  };

  // Calculate dimensions for the legend.
  const legendPadding = { top: 10, left: 35, bottom: 0, right: 10 };
  const legendWidth = width - (legendPadding.left + legendPadding.right);
  const legendHeight = 40;

  // Heatmap expands to fill any space not used by the legend.
  const heatmapPadding = { top: 0, left: 0, bottom: 0, right: legendPadding.right };
  const heatmapWidth = width - (heatmapPadding.left + heatmapPadding.right);
  const heatmapHeight =
    height -
    (heatmapPadding.top + heatmapPadding.bottom) -
    (showLegend ? legendHeight + legendPadding.top + legendPadding.bottom : 0.0);

  const onBucketHover = (value?: number) => {
    setShowTriangle(value);
  };

  return (
    <>
      <g transform={`translate(${heatmapPadding.left}, ${heatmapPadding.top})`}>
        <HeatmapChart
          data={bucketData}
          width={heatmapWidth}
          height={heatmapHeight}
          colorDisplay={colorDisplay}
          timeZone={timeZone}
          timeRange={timeRange}
          dailyInterval={dailyIntervalHours}
          regions={regions}
          onHover={onBucketHover}
        />
      </g>

      {showLegend ? (
        <g
          transform={`translate(${legendPadding.left}, ${heatmapPadding.top +
            heatmapHeight +
            heatmapPadding.bottom +
            legendPadding.top})`}
        >
          <Legend
            width={legendWidth}
            height={legendHeight}
            min={bucketData.min}
            max={bucketData.max}
            valueDisplay={bucketData.valueDisplay}
            colorDisplay={colorDisplay}
            currentValue={showTriangle}
            indicator={showValueIndicator}
          />
        </g>
      ) : null}
    </>
  );
};

const measureText = (text: string): number => {
  var canvas = document.createElement('canvas');
  var ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.font = '14px Arial';
    return ctx.measureText(text).width;
  }
  return 0;
};
