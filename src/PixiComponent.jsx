import { useEffect, useRef } from "react";
import * as PIXI from "pixi.js";
import L from "leaflet";
import { algorithms } from "./algorithms";

//min-heap of node ids ordered by priority
class MinHeap {
  constructor() {
    this.items = [];
  }
  push(priority, id) {
    const items = this.items;
    items.push([priority, id]);
    let i = items.length - 1;
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (items[up][0] <= items[i][0]) break;
      [items[up], items[i]] = [items[i], items[up]];
      i = up;
    }
  }
  pop() {
    const items = this.items;
    if (items.length === 0) return undefined;
    const top = items[0];
    const last = items.pop();
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let min = i;
        if (left < items.length && items[left][0] < items[min][0]) min = left;
        if (right < items.length && items[right][0] < items[min][0])
          min = right;
        if (min === i) break;
        [items[min], items[i]] = [items[i], items[min]];
        i = min;
      }
    }
    return top[1];
  }
}

//every color of the drawing
const palette = {
  road: 0x7f93bd, //calm blue-gray, the roads are only the backdrop
  exploring: 0xfff3b0, //edges the search is looking at right now
  explored: 0xff8a3d, //edges it has already looked at
  routeGlow: 0x00d5ff,
  route: 0xeaffff,
  node: 0xffffff,
  startRing: 0x4ade80,
  endRing: 0xff4d6d,
};

//color between color1 (amount 0) and color2 (amount 1)
const mixColors = (color1, color2, amount) =>
  [16, 8, 0].reduce((mixed, shift) => {
    const channel1 = (color1 >> shift) & 0xff;
    const channel2 = (color2 >> shift) & 0xff;
    return (
      mixed | (Math.round(channel1 + (channel2 - channel1) * amount) << shift)
    );
  }, 0);

//line width of a road by its osm highway type
const roadWidth = (way) => {
  const type = (way.tags?.highway ?? "").replace("_link", "");
  if (["motorway", "trunk", "primary"].includes(type)) return 4;
  if (["secondary", "tertiary"].includes(type)) return 3;
  if (
    ["footway", "path", "steps", "cycleway", "pedestrian", "track"].includes(
      type,
    )
  )
    return 1;
  return 2;
};

const formatDistance = (meters) =>
  meters < 1000
    ? `${Math.round(meters)} m`
    : `${(meters / 1000).toFixed(2)} km`;

export const PixiComponent = ({
  osmData,
  map,
  startAndDestination,
  replayCount,
  algorithm,
  onResult,
}) => {
  const replayRef = useRef(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const algorithmRef = useRef(algorithm);
  algorithmRef.current = algorithm;

  useEffect(() => {
    //console.log(osmData);

    const { x: width, y: height } = map.getSize();
    const app = new PIXI.Application({
      width,
      height,
      antialias: true,
      backgroundAlpha: 0,
      //render at the screen's real pixel density
      resolution: window.devicePixelRatio,
      autoDensity: true,
    });
    //pixi canvas sits in its own leaflet pane above the map
    const pane = map.getPane("route") ?? map.createPane("route");
    Object.assign(pane.style, { zIndex: 450, pointerEvents: "none" });
    pane.appendChild(app.view);
    L.DomUtil.setPosition(app.view, map.containerPointToLayerPoint([0, 0]));

    // create function to convert node coordinates to pixi coordinates
    const convertCoordinates = (node) => {
      const point = map.latLngToContainerPoint([node.lat, node.lon]);
      return new PIXI.Point(point.x, point.y);
    };

    //haversine distance in meters
    const distance = (node1, node2) => {
      //console.log(node1, node2);
      const toRad = Math.PI / 180;
      const dLat = (node2.lat - node1.lat) * toRad;
      const dLon = (node2.lon - node1.lon) * toRad;
      const a =
        Math.pow(Math.sin(dLat / 2), 2) +
        Math.cos(node1.lat * toRad) *
          Math.cos(node2.lat * toRad) *
          Math.pow(Math.sin(dLon / 2), 2);
      return 2 * 6371000 * Math.asin(Math.sqrt(a));
    };

    //creating nodes map for easy access
    const nodesMap = new Map(
      osmData.elements
        .filter((element) => element.type === "node")
        .map((node) => {
          return [node.id, node];
        }),
    );

    //draw way function, all ways share one graphics object
    //roads and the start/end nodes fade in together
    const roadsLayer = new PIXI.Container();
    roadsLayer.alpha = 0;
    app.stage.addChild(roadsLayer);
    //edges the search looked at and the route it found, cleared on a replay
    const trailLayer = new PIXI.Container();
    app.stage.addChild(trailLayer);
    const pathLayer = new PIXI.Container();
    app.stage.addChild(pathLayer);
    //start/end nodes stay on top of whatever the search draws
    const nodesLayer = new PIXI.Container();
    nodesLayer.alpha = 0;
    app.stage.addChild(nodesLayer);
    const wayGraphics = new PIXI.Graphics();
    roadsLayer.addChild(wayGraphics);
    const drawWay = (way) => {
      const width = roadWidth(way);
      wayGraphics.lineStyle(width, palette.road, width === 1 ? 0.35 : 0.6);
      const nodeCoords = way.nodes.map((nodeId) => {
        const node = nodesMap.get(nodeId);
        return convertCoordinates(node);
      });
      let isFirstNode = true;
      for (const coord of nodeCoords) {
        if (coord) {
          if (isFirstNode) {
            wayGraphics.moveTo(coord.x, coord.y);
            isFirstNode = false;
          } else {
            wayGraphics.lineTo(coord.x, coord.y);
          }
        }
      }
    };

    //draw edge function
    const drawEdge = (edgeGraphics, node1, node2, lineStyle) => {
      //console.log(node1, node2);
      edgeGraphics.lineStyle(lineStyle.width, lineStyle.color, lineStyle.alpha);
      const node1Coord = convertCoordinates(node1);
      const node2Coord = convertCoordinates(node2);
      edgeGraphics.moveTo(node1Coord.x, node1Coord.y);
      edgeGraphics.lineTo(node2Coord.x, node2Coord.y);
    };

    const showMessage = (text) => {
      const message = new PIXI.Text(text, { fill: 0xffffff, fontSize: 24 });
      message.position.set(16, 16);
      app.stage.addChild(message);
    };

    const ways = osmData.elements.filter((element) => element.type === "way");
    //big roads are drawn last so they end up on top
    [...ways]
      .sort((way1, way2) => roadWidth(way1) - roadWidth(way2))
      .forEach((way) => drawWay(way));

    //creating adjecency list, each edge weighted by its length
    const adjList = new Map();
    ways.forEach((way) => {
      //explored edges are drawn wide enough to cover the road under them
      const width = Math.max(2, roadWidth(way));
      for (let i = 0; i < way.nodes.length - 1; i++) {
        const [id1, id2] = [way.nodes[i], way.nodes[i + 1]];
        const length = distance(nodesMap.get(id1), nodesMap.get(id2));
        if (!adjList.has(id1)) adjList.set(id1, []);
        if (!adjList.has(id2)) adjList.set(id2, []);
        adjList.get(id1).push({ id: id2, length, width });
        adjList.get(id2).push({ id: id1, length, width });
      }
    });
    //console.log(adjList);

    //finding the nodes closest to the start and end coordinates
    let startNode = null;
    let endNode = null;
    let currDiffFromStart = Infinity;
    let currDiffFromEnd = Infinity;
    for (const nodeId of adjList.keys()) {
      const node = nodesMap.get(nodeId);
      const diffFromStart = distance(node, startAndDestination[0]);
      if (diffFromStart < currDiffFromStart) {
        startNode = node;
        currDiffFromStart = diffFromStart;
      }
      const diffFromEnd = distance(node, startAndDestination[1]);
      if (diffFromEnd < currDiffFromEnd) {
        endNode = node;
        currDiffFromEnd = diffFromEnd;
      }
    }
    if (!startNode || !endNode) {
      showMessage("No roads found in this area");
      return () => app.destroy(true);
    }

    console.log("Start and End coordinates", startAndDestination);
    console.log("Start node: ", startNode, "\nEnd node: ", endNode);
    //drawing start and end nodes
    [
      [startNode, palette.startRing],
      [endNode, palette.endRing],
    ].forEach(([node, ringColor]) => {
      const { x, y } = convertCoordinates(node);
      const nodeGraphics = new PIXI.Graphics();
      nodeGraphics.lineStyle(3, ringColor, 1);
      nodeGraphics.beginFill(palette.node);
      nodeGraphics.drawCircle(x, y, 6);
      nodeGraphics.endFill();
      nodesLayer.addChild(nodeGraphics);
    });

    //the search, see algorithms.js for how the algorithms differ
    let visited, queue, parent, costFromStart, nodeBudget, queuedCount;
    const resetSearch = () => {
      visited = new Set();
      queue = new MinHeap();
      parent = new Map([[startNode.id, null]]);
      costFromStart = new Map([[startNode.id, 0]]);
      queue.push(0, startNode.id);
      nodeBudget = 0;
      queuedCount = 0;
    };
    resetSearch();
    //tells the page how the search is going
    const report = (state) =>
      onResultRef.current({
        explored: visited.size,
        total: adjList.size,
        ...state,
      });
    //whole graph gets explored in about 60 seconds at most
    const nodesPerTick = adjList.size / 1800;

    //edges of the latest steps glow, then settle into the explored color
    const settleTicks = 30;
    let settledCount;
    const resetTrail = () => {
      settledCount = 0;
    };
    resetTrail();
    const fadeTrail = () => {
      const steps = trailLayer.children;
      for (let i = settledCount; i < steps.length; i++) {
        const settled = Math.min(1, ++steps[i].age / settleTicks);
        steps[i].tint = mixColors(palette.exploring, palette.explored, settled);
        if (i === settledCount && settled === 1) settledCount++;
      }
    };

    function animationLoop() {
      const { requeue, priority } = algorithms[algorithmRef.current];
      nodeBudget += nodesPerTick;
      if (nodeBudget < 1) return;
      //edges explored in this tick share one graphics object
      //drawn in white, the color comes from the tint set in fadeTrail
      const tickGraphics = new PIXI.Graphics();
      tickGraphics.age = 0;
      tickGraphics.tint = palette.exploring;
      trailLayer.addChild(tickGraphics);
      for (; nodeBudget >= 1; nodeBudget--) {
        const queueElement = queue.pop();
        if (queueElement === undefined) {
          app.ticker.remove(animationLoop);
          report({ found: false });
          return;
        }
        if (visited.has(queueElement)) continue;
        visited.add(queueElement);

        if (queueElement === endNode.id) {
          app.ticker.remove(animationLoop);
          startPath();
          return;
        }

        adjList.get(queueElement).forEach(({ id: nodeId, length, width }) => {
          if (visited.has(nodeId)) return;
          drawEdge(
            tickGraphics,
            nodesMap.get(queueElement),
            nodesMap.get(nodeId),
            {
              width,
              color: 0xffffff,
              alpha: 1,
            },
          );
          const cost = costFromStart.get(queueElement) + length;
          if (
            requeue === "always" ||
            !costFromStart.has(nodeId) ||
            (requeue === "cheaper" && cost < costFromStart.get(nodeId))
          ) {
            costFromStart.set(nodeId, cost);
            parent.set(nodeId, queueElement);
            const toEnd = distance(nodesMap.get(nodeId), endNode);
            queue.push(priority(cost, toEnd, queuedCount++), nodeId);
          }
        });
      }
      report({});
    }

    //the found route flows from the start to the end in about 1.5s
    let pathPoints, pathProgress;
    // neonish line: a wide soft glow under a thin bright core
    const pathStyles = [
      { width: 10, color: palette.routeGlow, alpha: 0.4 },
      { width: 3, color: palette.route, alpha: 1 },
    ];
    const pathGraphics = pathStyles.map(() => new PIXI.Graphics());
    pathLayer.addChild(...pathGraphics);

    function startPath() {
      pathPoints = [];
      for (
        let nodeId = endNode.id;
        nodeId !== null;
        nodeId = parent.get(nodeId)
      )
        pathPoints.push(convertCoordinates(nodesMap.get(nodeId)));
      pathPoints.reverse();
      pathProgress = 1;
      app.ticker.add(pathLoop);
    }

    function pathLoop() {
      pathProgress = Math.min(
        pathPoints.length,
        pathProgress + pathPoints.length / 45,
      );
      //redrawn as one line each tick so the joints stay smooth
      pathGraphics.forEach((graphics, index) => {
        graphics.clear();
        graphics.lineStyle({
          ...pathStyles[index],
          join: PIXI.LINE_JOIN.ROUND,
          cap: PIXI.LINE_CAP.ROUND,
        });
        graphics.moveTo(pathPoints[0].x, pathPoints[0].y);
        for (let i = 1; i < pathProgress; i++)
          graphics.lineTo(pathPoints[i].x, pathPoints[i].y);
      });
      if (pathProgress < pathPoints.length) return;
      app.ticker.remove(pathLoop);
      report({
        found: true,
        distance: formatDistance(costFromStart.get(endNode.id)),
      });
    }

    app.ticker.maxFPS = 30;
    //roads fade in for 1s -> search starts 1s later
    let startTimer;
    let introDone = false;
    const fadeInRoads = () => {
      //slow frames don't make the fade jump
      const step = Math.min(app.ticker.deltaMS, 50) / 1000;
      roadsLayer.alpha = Math.min(1, roadsLayer.alpha + step);
      nodesLayer.alpha = roadsLayer.alpha;
      if (roadsLayer.alpha < 1) return;
      app.ticker.remove(fadeInRoads);
      introDone = true;
      startTimer = setTimeout(() => app.ticker.add(animationLoop), 1000);
    };
    app.ticker.add(fadeInRoads);
    app.ticker.add(fadeTrail);

    //clears what the search drew and runs it again on the same roads
    replayRef.current = () => {
      if (!introDone) return;
      clearTimeout(startTimer);
      app.ticker.remove(animationLoop);
      app.ticker.remove(pathLoop);
      trailLayer.removeChildren().forEach((child) => child.destroy());
      pathGraphics.forEach((graphics) => graphics.clear());
      resetSearch();
      resetTrail();
      onResultRef.current(null);
      startTimer = setTimeout(() => app.ticker.add(animationLoop), 500);
    };

    return () => {
      replayRef.current = null;
      clearTimeout(startTimer);
      app.destroy(true);
    };
  }, [osmData]);

  //the search also starts over when another algorithm is picked
  useEffect(() => {
    replayRef.current?.();
  }, [replayCount, algorithm]);

  //console.log(osm);
  return null;
};
