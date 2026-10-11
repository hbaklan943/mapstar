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

export const PixiComponent = ({
  osmData,
  map,
  startAndDestination,
  replayCount,
  algorithm,
  onRoadsDrawn,
}) => {
  const replayRef = useRef(null);
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
    //pixi canvas sits in its own leaflet pane, above the map but below the
    //"Start" and "Destination" labels
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
    //everything the search draws, cleared on a replay
    const searchLayer = new PIXI.Container();
    app.stage.addChild(searchLayer);
    //start/end nodes stay on top of whatever the search draws
    const nodesLayer = new PIXI.Container();
    nodesLayer.alpha = 0;
    app.stage.addChild(nodesLayer);
    const wayGraphics = new PIXI.Graphics();
    wayGraphics.lineStyle(2, 0xc02f5c, 0.8); // Adjust line style as needed
    roadsLayer.addChild(wayGraphics);
    const drawWay = (way) => {
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
      searchLayer.addChild(message);
    };

    const ways = osmData.elements.filter((element) => element.type === "way");
    ways.forEach((way) => drawWay(way));

    //creating adjecency list, each edge weighted by its length
    const adjList = new Map();
    ways.forEach((way) => {
      for (let i = 0; i < way.nodes.length - 1; i++) {
        const [id1, id2] = [way.nodes[i], way.nodes[i + 1]];
        const length = distance(nodesMap.get(id1), nodesMap.get(id2));
        if (!adjList.has(id1)) adjList.set(id1, []);
        if (!adjList.has(id2)) adjList.set(id2, []);
        adjList.get(id1).push({ id: id2, length });
        adjList.get(id2).push({ id: id1, length });
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
    [startNode, endNode].forEach((node) => {
      const { x, y } = convertCoordinates(node);
      const nodeGraphics = new PIXI.Graphics();
      nodeGraphics.lineStyle(2, 0xffffff, 1);
      nodeGraphics.beginFill(0xeb2662);
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
    //whole graph gets explored in about 60 seconds at most
    const nodesPerTick = adjList.size / 1800;

    function animationLoop() {
      const { requeue, priority } = algorithms[algorithmRef.current];
      nodeBudget += nodesPerTick;
      if (nodeBudget < 1) return;
      //edges explored in this tick share one graphics object
      const tickGraphics = new PIXI.Graphics();
      searchLayer.addChild(tickGraphics);
      for (; nodeBudget >= 1; nodeBudget--) {
        const queueElement = queue.pop();
        if (queueElement === undefined) {
          app.ticker.remove(animationLoop);
          showMessage("No route found");
          return;
        }
        if (visited.has(queueElement)) continue;
        visited.add(queueElement);

        if (queueElement === endNode.id) {
          const pathGraphics = new PIXI.Graphics();
          searchLayer.addChild(pathGraphics);
          drawPath(pathGraphics, queueElement);
          app.ticker.remove(animationLoop);
          return;
        }

        adjList.get(queueElement).forEach(({ id: nodeId, length }) => {
          if (visited.has(nodeId)) return;
          drawEdge(
            tickGraphics,
            nodesMap.get(queueElement),
            nodesMap.get(nodeId),
            {
              width: 2,
              color: 0x00ff00,
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
    }

    function drawPath(pathGraphics, nodeId) {
      if (parent.get(nodeId) === null) {
        return;
      }
      // draw neonish edges
      drawEdge(
        pathGraphics,
        nodesMap.get(nodeId),
        nodesMap.get(parent.get(nodeId)),
        {
          width: 2,
          color: 0x8888ff,
          alpha: 1,
        },
      );
      drawEdge(
        pathGraphics,
        nodesMap.get(nodeId),
        nodesMap.get(parent.get(nodeId)),
        {
          width: 5,
          color: 0x0000ff,

          alpha: 0.5,
        },
      );
      drawPath(pathGraphics, parent.get(nodeId));
    }

    app.ticker.maxFPS = 30;
    //roads fade in for 1s -> map dims for 1s -> search starts
    let startTimer;
    let introDone = false;
    const fadeInRoads = () => {
      //slow frames don't make the fade jump
      const step = Math.min(app.ticker.deltaMS, 50) / 1000;
      roadsLayer.alpha = Math.min(1, roadsLayer.alpha + step);
      nodesLayer.alpha = roadsLayer.alpha;
      if (roadsLayer.alpha < 1) return;
      app.ticker.remove(fadeInRoads);
      onRoadsDrawn();
      introDone = true;
      startTimer = setTimeout(() => app.ticker.add(animationLoop), 1000);
    };
    app.ticker.add(fadeInRoads);

    //clears what the search drew and runs it again on the same roads
    replayRef.current = () => {
      if (!introDone) return;
      clearTimeout(startTimer);
      app.ticker.remove(animationLoop);
      searchLayer.removeChildren().forEach((child) => child.destroy());
      resetSearch();
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

//0x952547
//0x00ff00
