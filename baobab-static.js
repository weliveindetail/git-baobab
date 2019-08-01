if (!String.prototype.format) {
  String.prototype.format = function() {
    var args = Array.prototype.slice.call(arguments);
    return this.replace(/{(\d+)}/g, function(match, number) {
      return typeof args[number] != 'undefined'
        ? args[number] 
        : match
      ;
    });
  };
}

// Define SVG coords with center in page center
const viewBox = { left: -50, top: -50, width: 100, height: 100 };
viewBox.radius = Math.min(viewBox.width, viewBox.height) / 2;
viewBox.right = viewBox.left + viewBox.width;
viewBox.bottom = viewBox.top + viewBox.height;

document.getElementById("baobab").setAttribute(
  "viewBox", "{0} {1} {2} {3}".format(
    viewBox.left, viewBox.top,
    viewBox.width, viewBox.height));

// View-related parameters
const baobab = {};
baobab.strokeWidth = viewBox.radius / 750;
baobab.globalFontSizeMax = viewBox.radius / 10;
baobab.globalFontSizeMin = viewBox.radius / 50;

function concatPath(d) {
  var path = d.data.n;
  for (var p = d.parent; p; p = p.parent) {
    path = p.data.n + "/" + path;
  }
  return path;
}

function tooltipFormat(d) {
  return "{0}\n{1} lines modified\n{2} lines today".format(
    concatPath(d), humanReadable(d.data.m), humanReadable(d.data.t));
}

function humanReadable(val) {
  if (val > 1000000)
    return Math.round(val / 100000) / 10 + 'M';
  else if (val > 1000)
    return Math.round(val / 100) / 10 + 'K';
  else
    return val;
}

function toHex(n) {
  const s = Math.round(n).toString(16);
  return s.length == 1 ? "0" + s : s;
};

function colorRatioSquareScale(d) {
  return (d.data.t == 0) ? 1 : Math.sqrt(d.data.m) / Math.sqrt(d.data.t);
}

function colorHotCold(d) {
  const ratio = Math.min(1, colorRatioSquareScale(d));
  const base = 16 * 3 + 3;
  const hot = base + (255 - base) * ratio;
  const cold = base + (255 - base) * (1 - ratio);
  return "#{0}88{1}".format(toHex(hot), toHex(cold));
}

function makeViewCoords(dx0, dx1, dd) {
  const twoPi = 2 * Math.PI;
  const x0inbounds = 0 < dx0 && dx0 < twoPi;
  const x1inbounds = 0 < dx1 && dx1 < twoPi;
  const fullCircle = dx0 <= 0 && twoPi <= dx1;
  if (x0inbounds || x1inbounds || fullCircle)
    return {
      x0: Math.max(0, dx0), x1: Math.min(twoPi, dx1), y0: dd, y1: dd + 1
    };

  // Global invariant: (y1 == 0) implies invisible
  return { x0: 0, x1: 0, y0: 0, y1: 0 };
}

const hierarchy = data => d3.hierarchy(data)
  .sum(d => {
    if (d.children) {
      // Only leafs (files) have a size, but as zeros are filtered out,
      // their sizes in the invisible category would be missed.
      d.todayInvisible = d.t - d.children.reduce(
        (sum, child) => sum + child.t, 0
      );
      d.modifiedInvisible = d.m - d.children.reduce(
        (sum, child) => sum + child.m, 0
      );

      console.assert(d.modifiedInvisible == 0, "Other categories not implemented yet");
      return d.modifiedInvisible;
    }
    return d.children ? d.modifiedInvisible : d.m;
  })
  .sort((a, b) => {
    return b.data.m - a.data.m;
  });

const partition = hierarchy => {
  return d3.partition().size([2 * Math.PI, hierarchy.height])(hierarchy);
};

baobab.root = partition(hierarchy(baobab_data));
baobab.root.each(d => d.view = makeViewCoords(d.x0, d.x1, d.depth));

function makeScaleY(viewRoot) {
  return d3.scaleLog().domain([1, viewRoot.height + 1]).range([15, viewBox.radius]);
}

var scale_y = makeScaleY(baobab.root);

function rad2deg(rad) {
  return rad * 90 / Math.PI;
}

function labelTransform(d) {
  // Not sure where this edge case comes from,
  // but it produces Infs on log scale.
  if (d.view.y0 + d.view.y1 <= 1 || !d.padding)
      return ``;

  var x = rad2deg(d.view.x0 + d.view.x1);
  var y = scale_y(d.view.y0) + d.padding + d.fontSize / 2;
  if (x >= 90 && x <= 270) {
    return `rotate(${x + 180}) translate(0, ${y})`;
  } else {
    return `rotate(${x}) translate(0, ${-y})`;
  }
}

const arc = d3.arc()
  .startAngle(d => d.view.x0)
  .endAngle(d => d.view.x1)
  .innerRadius(d => scale_y(d.view.y0))
  .outerRadius(d => scale_y(d.view.y1));

const svg = d3.select('#baobab')
  .style("font", "sans-serif");

baobab.canvas = svg.append("g");

baobab.arcShapes = baobab.canvas.append("g")
  .selectAll("path")
  .data(baobab.root.descendants().slice(1))
  .join("path")
  .attr("d", d => arc(d))
  .style("stroke-width", baobab.strokeWidth);

baobab.arcShapes
  .filter(d => d.view.y1 > 0)
  .attr("stroke-opacity", 1)
  .attr("fill-opacity", 1)
  .attr("fill", d => colorHotCold(d));

baobab.arcShapes
  .filter(d => d.view.y1 == 0)
  .attr("stroke-opacity", 0)
  .attr("fill-opacity", 0);

baobab.arcShapes
  .filter(d => d.children)
  .style("cursor", "pointer")
  .on("click", clicked);

baobab.arcToolTips = baobab.arcShapes.append("title")
  .text(d => tooltipFormat(d));

function balanceProportions(rr, tr) {
  var max = Math.PI / 2;
  var min = 0;
  // Find zero approximately. Should be 8 bisects.
  while (max > min + 0.01) {
    const pivot = (min + max) / 2;
    if (Math.sin(pivot) - rr - (2 * Math.cos(pivot)) / tr > 0) {
      max = pivot;
    } else {
      min = pivot;
    }
  }
  return min;
}

function fitTextToArc(arcSpec, textRatio) {
  const boundsDistance = (fontSize) => {
    const legX = (fontSize * textRatio) / 2;
    const legY = arcSpec.innerRadius + fontSize;
    const hypotenuse = Math.sqrt(Math.pow(legX, 2) + Math.pow(legY, 2));
    return arcSpec.outerRadius - hypotenuse;
  };

  // Choose font-size that likely fits in the arc. Works for most cases.
  const desiredFontSize =
      Math.max(baobab.globalFontSizeMin,
                Math.min(arcSpec.height / 2,
                        arcSpec.innerLength * 0.9 / textRatio,
                        baobab.globalFontSizeMax));
  const totalPadding = boundsDistance(desiredFontSize);
  const innerTextAngle = Math.atan((desiredFontSize * textRatio) /
                                    (2 * arcSpec.innerRadius + totalPadding));
  if (totalPadding > 0 && innerTextAngle < arcSpec.centralAngle / 2)
    return [desiredFontSize, totalPadding / 2];

  // Choose acceptable padding and determine matching font-size.
  const desiredPadding = arcSpec.height * 0.1;
  const radiusRatio = (arcSpec.innerRadius + desiredPadding) /
                      (arcSpec.outerRadius - desiredPadding);
  const outerTextAngle = balanceProportions(radiusRatio, textRatio);
  const matchingFontSize = arcSpec.outerRadius * (Math.sin(outerTextAngle) - radiusRatio);
  if (matchingFontSize > baobab.globalFontSizeMin &&
      outerTextAngle < arcSpec.centralAngle / 2) {
    const actualPadding = boundsDistance(matchingFontSize);
    const actualFontSize = Math.min(matchingFontSize, baobab.globalFontSizeMax);
    if (actualPadding > 0)
      return [actualFontSize, actualPadding / 2];
  }

  if (desiredFontSize > baobab.globalFontSizeMin) {
    const minTotalPadding = boundsDistance(baobab.globalFontSizeMin);
    const innerTextAngle = Math.atan((baobab.globalFontSizeMin * textRatio) /
                                      (2 * arcSpec.innerRadius + minTotalPadding));
    if (minTotalPadding > 0 && innerTextAngle < arcSpec.centralAngle / 2)
      return [baobab.globalFontSizeMin, minTotalPadding / 2];
  }

  // All approaches failed. Hide label and log error in caller.
  return [0.001, 0];
}

function makeArcSpec(view) {
  const spec = {};
  //console.assert(view.y0 == view.y1 - 1, "Integral Y-scale increments");
  //console.assert(0 <= view.x0 && view.x0 <= view.x1 && view.x1 <= 2 * Math.PI,
  //               "X-scale in radians");

  spec.innerRadius = scale_y(view.y0);
  spec.outerRadius = scale_y(view.y1);
  spec.centralAngle = view.x1 - view.x0;
  spec.innerLength = spec.centralAngle * spec.innerRadius;
  spec.height = spec.outerRadius - spec.innerRadius;

  //console.assert(spec.outerRadius <= viewBox.radius, "Radius exceeding bounds");
  //console.assert(spec.innerLength < 2 * Math.PI * viewBox.radius &&
  //               spec.innerLength >= 0, "Invalid inner arc length");
  return spec;
}

function labelFontSizeArc(d) {
  [ d.fontSize, d.padding ] = fitTextToArc(makeArcSpec(d.view), d.textRatio);
  if (d.fontSize <= 0.001)
    console.log("Failed to determine font-size to fit: %s", d.data.n);

  return d.fontSize + "px";
}

function labelVisible(d) {
  // Invisible arc.
  if (d.view.y1 == 0)
    return false;

  // No way to fit in text.
  const arcSpec = makeArcSpec(d.view);
  if (baobab.globalFontSizeMin > arcSpec.height / 2 ||
      baobab.globalFontSizeMin * d.textRatio > arcSpec.outerRadius)
    return false;

  return true;
}

function labelFontSizeRoot(element, d) {
  // Constant size, variable content. Initial font-size is 14px.
  const textRatio = (d.fontSize || 14) / element.getComputedTextLength();
  const matchingFontSize = 2 * scale_y(1) * textRatio * 0.9;
  d.fontSize = Math.min(matchingFontSize, baobab.globalFontSizeMax);
  return d.fontSize + "px";
}

baobab.arcLabels = baobab.canvas.append("g")
  .attr("pointer-events", "none")
  .style("fill", "#333")
  .selectAll("text")
  .data(baobab.root.descendants().slice(1))
  .join("text")
  .attr("text-anchor", "middle")
  .attr("dominant-baseline", "central")
  .attr("font-family", "sans-serif")
  .text(d => d.data.n);

// Calculate ratio of text-width to font-size once, based on initial 14px
// font-size. Ratio is constant because arc label content is fixed.
baobab.arcLabels.each(function(d) {
  d.textRatio = this.getComputedTextLength() / 14;
});

baobab.arcLabels
  .filter(d => labelVisible(d))
  .attr("fill-opacity", 1)
  .attr("font-size", d => labelFontSizeArc(d))
  .attr("transform", d => labelTransform(d))
  .on("click", clicked);

baobab.arcLabels
  .filter(d => !labelVisible(d))
  .attr("fill-opacity", 0);

baobab.rootShape = baobab.canvas.append("circle")
  .datum(baobab.root)
  .attr("r", scale_y(1))
  .attr("fill", "#eee")
  .attr("fill-opacity", 0.6)
  .attr("pointer-events", "all")
  .on("click", p => clicked(p.parent));

baobab.rootToolTip = baobab.rootShape.append("title")
  .text(d => tooltipFormat(d));

baobab.rootLabel = baobab.canvas.append("text")
  .datum(baobab.root)
  .text(d => concatPath(d))
  .attr("fill", "#333")
  .attr("text-anchor", "middle")
  .attr("dy", "-1.2px")
  .attr("font-family", "sans-serif")
  .style("font-size", function(d) {
    return labelFontSizeRoot(this, d);
  });

function clicked(item) {
  const r = item || baobab.root;
  scale_y = makeScaleY(r);

  baobab.rootShape
    .datum(r)
    .style("cursor", r.parent ? "pointer" :  "default");

  baobab.rootToolTip
    .text(d => tooltipFormat(d));

  baobab.rootLabel
    .text(concatPath(r))
    .style("font-size", function(d) {
      return labelFontSizeRoot(this, d);
    });

  baobab.rootLabelLinesToday
    .datum(r)
    .text(d => d.data.t + " lines today");

  baobab.rootLabelLinesModified
    .datum(r)
    .text(d => d.data.m + " lines inserted / deleted");

  const twoPi = 2 * Math.PI;
  const reciprocalDiffRootX = 1 / (r.x1 - r.x0);
  const makeSubviewCoords = (dx0, dx1, dd) => {
    const nd = dd - r.depth;
    if (nd > 0) {
      const nx0 = (dx0 - r.x0) * reciprocalDiffRootX;
      const nx1 = (dx1 - r.x0) * reciprocalDiffRootX;
      const x0inbounds = 0 < nx0 && nx0 < 1;
      const x1inbounds = 0 < nx1 && nx1 < 1;
      const fullCircle = nx0 <= 0 && 1 <= nx1;
      if (x0inbounds || x1inbounds || fullCircle)
        return {
          x0: Math.max(0, nx0) * twoPi,
          x1: Math.min(1, nx1) * twoPi,
          y0: nd,
          y1: nd + 1
        };
    }

    // Global invariant: (y1 == 0) implies invisible
    return { x0: 0, x1: 0, y0: 0, y1: 0 };
  };

  baobab.root.each(d => d.view = makeSubviewCoords(d.x0, d.x1, d.depth));

  baobab.arcShapes
    .attr("d", d => arc(d))
    .attr("fill-opacity", d => (d.view.y1 > 0) ? 1 : 0)
    .attr("stroke-opacity", d => (d.view.y1 > 0) ? 1 : 0);

  baobab.arcLabels
    .filter(d => labelVisible(d))
    .attr("fill-opacity", 1)
    .attr("font-size", d => labelFontSizeArc(d))
    .attr("transform", d => labelTransform(d));

  baobab.arcLabels
    .filter(d => !labelVisible(d))
    .attr("fill-opacity", 0);
}
