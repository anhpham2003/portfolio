import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import scrollama from 'https://cdn.jsdelivr.net/npm/scrollama@3.2.0/+esm';

async function loadData() {
  const data = await d3.csv('loc.csv', (row) => ({
    ...row,
    line: Number(row.line),
    depth: Number(row.depth),
    length: Number(row.length),
    date: new Date(row.date + 'T00:00' + row.timezone),
    datetime: new Date(row.datetime),
  }));

  return data;
}

function processCommits(data) {
  return d3
    .groups(data, (d) => d.commit)
    .map(([commit, lines]) => {
      let first = lines[0];
      let { author, date, time, timezone, datetime } = first;
      let ret = {
        id: commit,
        url: 'https://github.com/anhpham2003/portfolio/commit/' + commit,
        author,
        date,
        time,
        timezone,
        datetime,
        hourFrac: datetime.getHours() + datetime.getMinutes() / 60,
        totalLines: lines.length,
      };

      Object.defineProperty(ret, 'lines', {
        value: lines,
        configurable: true,
        writable: true,
        enumerable: false,
      });

      return ret;
    })
    .sort((a, b) => a.datetime - b.datetime);
}

function renderCommitInfo(data, commits) {
  const lines = commits.flatMap((d) => d.lines);
  const dl = d3.select('#stats').html('').append('dl').attr('class', 'stats');

  dl.append('dt').text('Commits');
  dl.append('dd').text(commits.length);

  dl.append('dt').text('Files');
  dl.append('dd').text(d3.group(lines, (d) => d.file).size);

  dl.append('dt').html('Total <abbr title="Lines of code">LOC</abbr>');
  dl.append('dd').text(lines.length);

  dl.append('dt').text('Max depth');
  dl.append('dd').text(d3.max(lines, (d) => d.depth));

  dl.append('dt').text('Longest line');
  dl.append('dd').text(d3.max(lines, (d) => d.length));

  dl.append('dt').text('Average line length');
  dl.append('dd').text(Math.round(d3.mean(lines, (d) => d.length)));
}

function renderTooltipContent(commit) {
  const link = document.getElementById('commit-link');
  const date = document.getElementById('commit-date');
  const time = document.getElementById('commit-time');
  const author = document.getElementById('commit-author');
  const lines = document.getElementById('commit-lines');

  if (Object.keys(commit).length === 0) return;

  link.href = commit.url;
  link.textContent = commit.id;
  date.textContent = commit.datetime?.toLocaleString('en', {
    dateStyle: 'full',
  });
  time.textContent = commit.datetime?.toLocaleString('en', {
    timeStyle: 'short',
  });
  author.textContent = commit.author;
  lines.textContent = commit.totalLines;
}

function updateTooltipVisibility(isVisible) {
  const tooltip = document.getElementById('commit-tooltip');
  tooltip.hidden = !isVisible;
}

function updateTooltipPosition(event) {
  const tooltip = document.getElementById('commit-tooltip');
  tooltip.style.left = `${event.clientX}px`;
  tooltip.style.top = `${event.clientY}px`;
}

function createBrushSelector(svg, brushed, usableArea) {
  svg.call(
    d3
      .brush()
      .extent([
        [usableArea.left, usableArea.top],
        [usableArea.right, usableArea.bottom],
      ])
      .on('start brush end', brushed),
  );
  svg.selectAll('.dots, .overlay ~ *').raise();
}

function getVisibleCommits(commits, xScale, yScale, rScale) {
  const sortedCommits = d3.sort(commits, (d) => -d.totalLines);
  const visibleCommits = [];

  for (const commit of sortedCommits) {
    const x = xScale(commit.datetime);
    const y = yScale(commit.hourFrac);
    const r = rScale(commit.totalLines);
    const overlapsLargerCommit = visibleCommits.some((visibleCommit) => {
      const visibleX = xScale(visibleCommit.datetime);
      const visibleY = yScale(visibleCommit.hourFrac);
      const visibleR = rScale(visibleCommit.totalLines);
      return Math.hypot(x - visibleX, y - visibleY) < visibleR + r;
    });

    if (!overlapsLargerCommit) {
      visibleCommits.push(commit);
    }
  }

  return visibleCommits;
}

function renderScatterPlot(data, commits) {
  const width = 1000;
  const height = 600;
  const margin = { top: 10, right: 10, bottom: 30, left: 20 };
  const usableArea = {
    top: margin.top,
    right: width - margin.right,
    bottom: height - margin.bottom,
    left: margin.left,
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom,
  };

  const svg = d3
    .select('#chart')
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .style('overflow', 'visible');

  const xScale = d3
    .scaleTime()
    .domain(d3.extent(commits, (d) => d.datetime))
    .range([usableArea.left, usableArea.right])
    .nice();

  const yScale = d3
    .scaleLinear()
    .domain([0, 24])
    .range([usableArea.bottom, usableArea.top]);
  const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);
  const rScale = d3
    .scaleSqrt()
    .domain([minLines, maxLines])
    .range([3, 18]);
  const visibleCommits = getVisibleCommits(commits, xScale, yScale, rScale);

  function isCommitSelected(selection, commit) {
    if (!selection) {
      return false;
    }

    const [[x0, y0], [x1, y1]] = selection;
    const x = xScale(commit.datetime);
    const y = yScale(commit.hourFrac);

    return x >= x0 && x <= x1 && y >= y0 && y <= y1;
  }

  function renderSelectionCount(selection) {
    const selectedCommits = selection
      ? visibleCommits.filter((d) => isCommitSelected(selection, d))
      : [];

    const countElement = document.querySelector('#selection-count');
    countElement.textContent = `${
      selectedCommits.length || 'No'
    } commits selected`;

    return selectedCommits;
  }

  function renderLanguageBreakdown(selection) {
    const selectedCommits = selection
      ? visibleCommits.filter((d) => isCommitSelected(selection, d))
      : [];
    const container = document.getElementById('language-breakdown');

    if (selectedCommits.length === 0) {
      container.innerHTML = '';
      return;
    }

    const lines = selectedCommits.flatMap((d) => d.lines);
    const breakdown = d3.rollup(
      lines,
      (v) => v.length,
      (d) => d.type,
    );

    container.innerHTML = '';

    for (const [language, count] of breakdown) {
      const proportion = count / lines.length;
      const formatted = d3.format('.1~%')(proportion);

      container.innerHTML += `
        <dt>${language}</dt>
        <dd>${count} lines (${formatted})</dd>
      `;
    }
  }

  function brushed(event) {
    const selection = event.selection;
    d3.selectAll('circle').classed('selected', (d) =>
      isCommitSelected(selection, d),
    );
    renderSelectionCount(selection);
    renderLanguageBreakdown(selection);
  }

  const xAxis = d3.axisBottom(xScale);
  const yAxis = d3
    .axisLeft(yScale)
    .tickFormat((d) => String(d % 24).padStart(2, '0') + ':00');

  const gridlines = svg
    .append('g')
    .attr('class', 'gridlines')
    .attr('transform', `translate(${usableArea.left}, 0)`);

  gridlines.call(d3.axisLeft(yScale).tickFormat('').tickSize(-usableArea.width));

  svg
    .append('g')
    .attr('transform', `translate(0, ${usableArea.bottom})`)
    .attr('class', 'x-axis')
    .call(xAxis);

  svg
    .append('g')
    .attr('transform', `translate(${usableArea.left}, 0)`)
    .attr('class', 'y-axis')
    .call(yAxis);

  const dots = svg.append('g').attr('class', 'dots');

  dots
    .selectAll('circle')
    .data(visibleCommits, (d) => d.id)
    .join('circle')
    .attr('cx', (d) => xScale(d.datetime))
    .attr('cy', (d) => yScale(d.hourFrac))
    .attr('r', (d) => rScale(d.totalLines))
    .style('--r', (d) => rScale(d.totalLines))
    .attr('fill', 'steelblue')
    .classed(
      'current-commit',
      (d) => d.datetime.getTime() === commitMaxTime.getTime(),
    )
    .style('fill-opacity', 0.7)
    .on('mouseenter', (event, commit) => {
      d3.select(event.currentTarget).style('fill-opacity', 1);
      renderTooltipContent(commit);
      updateTooltipVisibility(true);
      updateTooltipPosition(event);
    })
    .on('mouseleave', (event) => {
      d3.select(event.currentTarget).style('fill-opacity', 0.7);
      updateTooltipVisibility(false);
    });

  createBrushSelector(svg, brushed, usableArea);
}

function updateScatterPlot(data, commits) {
  const width = 1000;
  const height = 600;
  const margin = { top: 10, right: 10, bottom: 30, left: 20 };
  const usableArea = {
    top: margin.top,
    right: width - margin.right,
    bottom: height - margin.bottom,
    left: margin.left,
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom,
  };

  const svg = d3.select('#chart').select('svg');

  const xScale = d3
    .scaleTime()
    .domain(d3.extent(commits, (d) => d.datetime))
    .range([usableArea.left, usableArea.right])
    .nice();

  const yScale = d3
    .scaleLinear()
    .domain([0, 24])
    .range([usableArea.bottom, usableArea.top]);

  const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);
  const rScale = d3
    .scaleSqrt()
    .domain([minLines, maxLines])
    .range([3, 18]);

  const xAxis = d3.axisBottom(xScale);
  const xAxisGroup = svg.select('g.x-axis');
  xAxisGroup.selectAll('*').remove();
  xAxisGroup.call(xAxis);

  const visibleCommits = getVisibleCommits(commits, xScale, yScale, rScale);
  const dots = svg.select('g.dots');

  dots
    .selectAll('circle')
    .data(visibleCommits, (d) => d.id)
    .join('circle')
    .attr('cx', (d) => xScale(d.datetime))
    .attr('cy', (d) => yScale(d.hourFrac))
    .attr('r', (d) => rScale(d.totalLines))
    .style('--r', (d) => rScale(d.totalLines))
    .attr('fill', 'steelblue')
    .classed(
      'current-commit',
      (d) => d.datetime.getTime() === commitMaxTime.getTime(),
    )
    .style('fill-opacity', 0.7)
    .on('mouseenter', (event, commit) => {
      d3.select(event.currentTarget).style('fill-opacity', 1);
      renderTooltipContent(commit);
      updateTooltipVisibility(true);
      updateTooltipPosition(event);
    })
    .on('mouseleave', (event) => {
      d3.select(event.currentTarget).style('fill-opacity', 0.7);
      updateTooltipVisibility(false);
    });
}

function updateFileDisplay(commits) {
  lines = commits.flatMap((d) => d.lines);
  files = d3
    .groups(lines, (d) => d.file)
    .map(([name, lines]) => {
      return { name, lines };
    })
    .sort((a, b) => b.lines.length - a.lines.length);

  const filesContainer = d3
    .select('#files')
    .selectAll('div')
    .data(files, (d) => d.name)
    .join((enter) =>
      enter.append('div').call((div) => {
        div.append('dt').append('code');
        div.select('dt').append('small');
        div.append('dd');
      }),
    );

  filesContainer.select('dt > code').text((d) => d.name);
  filesContainer
    .select('dt > small')
    .text((d) => `${d.lines.length} lines`);

  filesContainer
    .select('dd')
    .selectAll('div')
    .data((d) => d.lines)
    .join('div')
    .attr('class', 'loc')
    .attr('style', (d) => `--color: ${colors(d.type)}`);
}

function updateFileLeader(commits) {
  const lines = commits.flatMap((d) => d.lines);
  const files = d3.rollups(
    lines,
    (D) => D.length,
    (d) => d.file,
  );
  const leader = d3.greatest(files, (d) => d[1]);
  const leaderElement = document.getElementById('file-leader');

  leaderElement.innerHTML = leader
    ? `Current leader: <code>${leader[0]}</code> with ${leader[1]} lines`
    : '';
}

function updateForCommitTime(maxTime) {
  commitMaxTime = maxTime;
  commitProgress = timeScale(commitMaxTime);
  filteredCommits = commits.filter((d) => d.datetime <= commitMaxTime);

  document.getElementById('commit-progress').value = commitProgress;
  document.getElementById('commit-max-time').textContent =
    commitMaxTime.toLocaleString('en', {
      dateStyle: 'long',
      timeStyle: 'short',
    });

  renderCommitInfo(data, filteredCommits);
  updateFileDisplay(filteredCommits);
  updateFileLeader(filteredCommits);
  updateScatterPlot(data, filteredCommits);
}

function renderScatterStory(commits) {
  d3.select('#scatter-story')
    .selectAll('.step')
    .data(commits, (d) => d.id)
    .join('div')
    .attr('class', 'step')
    .html(
      (d, i) => `
        On ${d.datetime.toLocaleString('en', {
          dateStyle: 'full',
          timeStyle: 'short',
        })},
        I made <a href="${d.url}" target="_blank">${
          i > 0
            ? 'another glorious commit'
            : 'my first commit, and it was glorious'
        }</a>.
        I edited ${d.totalLines} lines across ${
          d3.rollups(
            d.lines,
            (D) => D.length,
            (d) => d.file,
          ).length
        } files.
        Then I looked over all I had made, and I saw that it was very good.
      `,
    );
}

function onStepEnter(response) {
  d3.select(response.element.parentNode)
    .selectAll('.step')
    .classed('active', function () {
      return this === response.element;
    });
  updateForCommitTime(response.element.__data__.datetime);
}

function renderFileStory(commits) {
  d3.select('#files-story')
    .selectAll('.step')
    .data(commits, (d) => d.id)
    .join('div')
    .attr('class', 'step')
    .html((d) => {
      const filesEdited = d3.rollups(
        d.lines,
        (D) => D.length,
        (d) => d.file,
      );
      const biggestFile = d3.greatest(filesEdited, (d) => d[1]);

      return `
        By ${d.datetime.toLocaleString('en', {
          dateStyle: 'long',
          timeStyle: 'short',
        })}, the codebase had grown to ${d3.sum(
          commits.filter((commit) => commit.datetime <= d.datetime),
          (commit) => commit.totalLines,
        )} lines.
        This commit touched ${filesEdited.length} files, with
        <code>${biggestFile[0]}</code> receiving ${biggestFile[1]} lines.
      `;
    });
}

let data = await loadData();
let commits = processCommits(data);
let commitProgress = 100;
let filteredCommits = commits;
let lines = filteredCommits.flatMap((d) => d.lines);
let files = d3
  .groups(lines, (d) => d.file)
  .map(([name, lines]) => {
    return { name, lines };
  })
  .sort((a, b) => b.lines.length - a.lines.length);
let colors = d3.scaleOrdinal(d3.schemeTableau10);
let timeScale = d3
  .scaleTime()
  .domain([
    d3.min(commits, (d) => d.datetime),
    d3.max(commits, (d) => d.datetime),
  ])
  .range([0, 100]);
let commitMaxTime = timeScale.invert(commitProgress);

function onTimeSliderChange() {
  commitProgress = Number(document.getElementById('commit-progress').value);
  updateForCommitTime(timeScale.invert(commitProgress));
}

console.log(commits);
renderCommitInfo(data, commits);
renderScatterPlot(data, commits);
updateFileDisplay(filteredCommits);
renderScatterStory(commits);
renderFileStory(commits);
updateForCommitTime(commitMaxTime);
document
  .getElementById('commit-progress')
  .addEventListener('input', onTimeSliderChange);

const scatterScroller = scrollama();
scatterScroller
  .setup({
    container: '#scrolly-1',
    step: '#scrolly-1 .step',
  })
  .onStepEnter(onStepEnter);

const filesScroller = scrollama();
filesScroller
  .setup({
    container: '#scrolly-2',
    step: '#scrolly-2 .step',
  })
  .onStepEnter(onStepEnter);
