import { fetchJSON, renderProjects } from '../global.js';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

const projects = await fetchJSON('../lib/projects.json') || [];
const projectsTitle = document.querySelector('.projects-title');
const projectsContainer = document.querySelector('.projects');
const searchInput = document.querySelector('.searchBar');
let query = '';
let selectedIndex = -1;
let selectedYear = null;

projectsTitle.textContent = `${projects.length} Projects`;
updatePage();

searchInput.addEventListener('input', (event) => {
  query = event.target.value;
  updatePage();
});

function getSearchFilteredProjects() {
  return projects.filter((project) => {
    let values = Object.values(project).join('\n').toLowerCase();
    return values.includes(query.toLowerCase());
  });
}

function updatePage() {
  let searchFilteredProjects = getSearchFilteredProjects();
  let selectedYearVisible = searchFilteredProjects.some((project) =>
    String(project.year) === String(selectedYear),
  );

  if (selectedYear !== null && !selectedYearVisible) {
    selectedYear = null;
  }

  let visibleProjects = selectedYear === null
    ? searchFilteredProjects
    : searchFilteredProjects.filter((project) =>
      String(project.year) === String(selectedYear),
    );

  renderProjects(visibleProjects, projectsContainer, 'h2');
  renderPieChart(visibleProjects);
}

function renderPieChart(projectsGiven) {
  let rolledData = d3.rollups(
    projectsGiven,
    (v) => v.length,
    (d) => d.year,
  );
  let data = rolledData.map(([year, count]) => {
    return { value: count, label: year };
  });
  let arcGenerator = d3.arc().innerRadius(0).outerRadius(50);
  let sliceGenerator = d3.pie().value((d) => d.value).sort(null);
  let arcData = sliceGenerator(data);
  let arcs = arcData.map((d) => arcGenerator(d));
  let colors = d3.scaleOrdinal(d3.schemeTableau10);
  let svg = d3.select('#projects-pie-plot');
  let legend = d3.select('.legend');

  selectedIndex = selectedYear === null
    ? -1
    : data.findIndex((d) => String(d.label) === String(selectedYear));

  if (selectedIndex === -1) {
    selectedYear = null;
  }

  svg.selectAll('path').remove();
  legend.selectAll('li').remove();

  function updateSelection(idx) {
    if (selectedIndex === idx) {
      selectedYear = null;
    } else {
      selectedYear = data[idx].label;
    }

    updatePage();
  }

  arcs.forEach((arc, idx) => {
    svg
      .append('path')
      .attr('d', arc)
      .attr('fill', colors(idx))
      .attr('class', idx === selectedIndex ? 'selected' : '')
      .on('click', () => {
        updateSelection(idx);
      });
  });

  data.forEach((d, idx) => {
    legend
      .append('li')
      .attr('style', `--color:${colors(idx)}`)
      .attr('class', idx === selectedIndex ? 'legend-item selected' : 'legend-item')
      .html(`<span class="swatch"></span> ${d.label} <em>(${d.value})</em>`)
      .on('click', () => {
        updateSelection(idx);
      });
  });
}
