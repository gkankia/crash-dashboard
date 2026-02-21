import React, { useRef, useEffect } from 'react';
import * as d3 from 'd3';

const CustomTimeline = ({ data, brushIndices, onBrushChange }) => {
  const svgRef = useRef();
  const containerRef = useRef();

  useEffect(() => {
    if (!data.length || !containerRef.current) return;

    const containerWidth = containerRef.current.offsetWidth;
    const height = 100;
    const margin = { top: 10, right: 20, bottom: 35, left: 40 };

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('width', containerWidth).attr('height', height);

    const chartWidth = containerWidth - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Create tooltip
    const tooltip = d3.select('body')
    .selectAll('.timeline-tooltip')
    .data([null])
    .join('div')
    .attr('class', 'timeline-tooltip')
    .style('position', 'absolute')
    .style('background', '#1a1a1a')
    .style('border', '1px solid #2a2a2a')
    .style('border-radius', '2px')
    .style('padding', '0.5rem')
    .style('color', '#e8e8e8')
    .style('font-size', '12px')
    .style('pointer-events', 'none')
    .style('opacity', 0)
    .style('z-index', 10000);
    
    // Scales
    const xScale = d3
      .scaleBand()
      .domain(data.map((d, i) => i))
      .range([0, chartWidth])
      .padding(0.1);

    const yScale = d3
      .scaleLinear()
      .domain([0, d3.max(data, d => d.count)])
      .range([chartHeight, 0]);

    // Bars
    g.selectAll('.bar')
        .data(data)
        .enter()
        .append('rect')
        .attr('class', 'bar')
        .attr('x', (d, i) => xScale(i))
        .attr('y', d => yScale(d.count))
        .attr('width', 2)
        .attr('height', d => chartHeight - yScale(d.count))
        .attr('fill', (d, i) => 
        i >= brushIndices.startIndex && i <= brushIndices.endIndex 
            ? '#8073ac' 
            : '#dddddd'
        )
        .attr('rx', 2)
        .style('cursor', 'pointer')
        .on('mouseover', function(event, d) {
        d3.select(this).attr('opacity', 0.7);
        
        const georgianMonths = ['იან', 'თებ', 'მარ', 'აპრ', 'მაი', 'ივნ', 
                                'ივლ', 'აგვ', 'სექ', 'ოქტ', 'ნოე', 'დეკ'];
        const parts = d.date.split('/');
        const date = new Date(parts[2], parts[1] - 1, parts[0]);
        const formattedDate = `${date.getDate()} ${georgianMonths[date.getMonth()]} ${date.getFullYear()}`;
        
        tooltip
            .style('opacity', 1)
            .html(`<strong>${formattedDate}</strong><br/>${d.count} შემთხვევა`)
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 10) + 'px');
        })
        .on('mousemove', function(event) {
        tooltip
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 10) + 'px');
        })
        .on('mouseout', function() {
        d3.select(this).attr('opacity', 1);
        tooltip.style('opacity', 0);
        });

    // Axes
    const georgianMonths = ['იან', 'თებ', 'მარ', 'აპრ', 'მაი', 'ივნ', 
                            'ივლ', 'აგვ', 'სექ', 'ოქტ', 'ნოე', 'დეკ'];
    
    const daysDifference = brushIndices.endIndex - brushIndices.startIndex + 1;
    
    let tickIndices;
    if (daysDifference > 90) {
      tickIndices = data
        .map((item, index) => ({ item, index }))
        .filter((d, i, arr) => {
          if (i === 0) return true;
          const parts = d.item.date.split('/');
          const prevParts = arr[i - 1].item.date.split('/');
          return parts[1] !== prevParts[1] || parts[2] !== prevParts[2];
        })
        .map(d => d.index);
    } else {
      tickIndices = data.map((d, i) => i).filter((i, idx) => idx % Math.max(1, Math.ceil(data.length / 15)) === 0);
    }

    const xAxis = d3.axisBottom(xScale)
      .tickValues(tickIndices)
      .tickFormat(i => {
        const parts = data[i].date.split('/');
        const date = new Date(parts[2], parts[1] - 1, parts[0]);
        
        if (daysDifference <= 90) {
          const day = date.getDate();
          const month = georgianMonths[date.getMonth()];
          const year = date.getFullYear().toString().slice(-2);
          return `${day} ${month} ${year}`;
        }
        
        const month = georgianMonths[date.getMonth()];
        const year = date.getFullYear().toString().slice(-2);
        return `${month} ${year}`;
      });

    g.append('g')
      .attr('transform', `translate(0,${chartHeight})`)
      .call(xAxis)
      .selectAll('text')
      .style('font-size', '10px')
      .style('fill', '#666');

    const yAxis = d3.axisLeft(yScale).ticks(5);
    g.append('g')
      .call(yAxis)
      .selectAll('text')
      .style('font-size', '10px')
      .style('fill', '#666');

    // Brush overlay
    const brushGroup = g.append('g').attr('class', 'brush-overlay');

    const startX = xScale(brushIndices.startIndex) || 0;
    const endX = (xScale(brushIndices.endIndex) || 0) + xScale.bandwidth();

    // Brush area
    const brushArea = brushGroup
      .append('rect')
      .attr('class', 'brush-area')
      .attr('x', startX)
      .attr('y', 0)
      .attr('width', endX - startX)
      .attr('height', chartHeight)
      .attr('fill', 'rgba(84, 39, 136, 0.1)');

    // Left handle
    const leftHandle = brushGroup
      .append('rect')
      .attr('class', 'handle-left')
      .attr('x', startX - 5)
      .attr('y', 0)
      .attr('width', 5)
      .attr('height', chartHeight)
      .attr('fill', '#542788')
      .style('cursor', 'ew-resize');

    // Right handle
    const rightHandle = brushGroup
      .append('rect')
      .attr('class', 'handle-right')
      .attr('x', endX - 5)
      .attr('y', 0)
      .attr('width', 5)
      .attr('height', chartHeight)
      .attr('fill', '#542788')
      .style('cursor', 'ew-resize');

    // Drag handlers
    const handleDrag = (handleType) => {
      let startX;
      let startIndices;
      let animationFrameId;
    
      return d3.drag()
        .on('start', function(event) {
          startX = event.x;
          startIndices = { ...brushIndices };
        })
        .on('drag', function(event) {
          if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
          }
          
          animationFrameId = requestAnimationFrame(() => {
            const dx = event.x - startX;
            const barWidth = chartWidth / data.length;
            const indexDelta = Math.round(dx / barWidth);
    
            if (handleType === 'left') {
              const newStart = Math.max(0, Math.min(startIndices.endIndex - 1, startIndices.startIndex + indexDelta));
              if (newStart !== brushIndices.startIndex) {
                onBrushChange({ startIndex: newStart, endIndex: brushIndices.endIndex });
              }
            } else if (handleType === 'right') {
              const newEnd = Math.min(data.length - 1, Math.max(startIndices.startIndex + 1, startIndices.endIndex + indexDelta));
              if (newEnd !== brushIndices.endIndex) {
                onBrushChange({ startIndex: brushIndices.startIndex, endIndex: newEnd });
              }
            } else {
              const range = startIndices.endIndex - startIndices.startIndex;
              let newStart = startIndices.startIndex + indexDelta;
              let newEnd = startIndices.endIndex + indexDelta;
              
              if (newStart < 0) {
                newStart = 0;
                newEnd = range;
              } else if (newEnd >= data.length) {
                newEnd = data.length - 1;
                newStart = newEnd - range;
              }
              
              if (newStart !== brushIndices.startIndex || newEnd !== brushIndices.endIndex) {
                onBrushChange({ startIndex: newStart, endIndex: newEnd });
              }
            }
          });
        })
        .on('end', () => {
          if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
          }
        });
    };

    leftHandle.call(handleDrag('left'));
    rightHandle.call(handleDrag('right'));
    brushArea.call(handleDrag('move')).style('cursor', 'move');

  }, [data, brushIndices, onBrushChange]);

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <svg ref={svgRef} style={{ display: 'block' }} />
    </div>
  );
};

export default CustomTimeline;