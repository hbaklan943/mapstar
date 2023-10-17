import { useEffect } from "react";
import * as PIXI from "pixi.js";

export const PixiComponent = ({ osmData, bounds, startAndDestination }) => {
  useEffect(() => {
    //console.log(osmData);

    const [width, height] = [1280, 720];
    const app = new PIXI.Application({
      width,
      height,
      antialias: true,
      backgroundColor: 0x24152a,
    });
    //change pixi background color
    document.getElementById("pixi-container").appendChild(app.view);

    // create function to convert node coordinates to pixi coordinates
    const convertCoordinates = (node) => {
      const x = (width / (bounds[3] - bounds[1])) * (node.lon - bounds[1]);
      const y =
        height - (height / (bounds[2] - bounds[0])) * (node.lat - bounds[0]);
      //console.log(bounds)
      //console.log(x, y);
      return new PIXI.Point(x, y);
    };

    const distance = (node1, node2) => {
      //console.log(node1, node2);
      return Math.sqrt(
        Math.pow(node1.lat - node2.lat, 2) + Math.pow(node1.lon - node2.lon, 2)
      );
    };

    //creating nodes map for easy access
    const nodesMap = new Map(
      osmData.elements
        .filter((element) => element.type === "node")
        .map((node) => {
          return [node.id, node];
        })
    );

    //draw way function
    const drawWay = (way, color) => {
      const wayGraphics = new PIXI.Graphics();
      wayGraphics.lineStyle(2, color, 0.5); // Adjust line style as needed
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
      app.stage.addChild(wayGraphics);
    };

    //draw edge function
    const drawEdge = (node1, node2, lineStyle) => {
      //console.log(node1, node2);
      const edgeGraphics = new PIXI.Graphics();
      edgeGraphics.lineStyle(lineStyle.width, lineStyle.color, lineStyle.alpha);
      const node1Coord = convertCoordinates(node1);
      const node2Coord = convertCoordinates(node2);
      edgeGraphics.moveTo(node1Coord.x, node1Coord.y);
      edgeGraphics.lineTo(node2Coord.x, node2Coord.y);
      app.stage.addChild(edgeGraphics);
    };

    let ways = [];
    let startNode = null;
    let startWay = null;
    let endNode = null;
    let currDiffFromStart = Infinity;
    let currDiffFromEnd = Infinity;
    osmData.elements
      .filter((element) => element.type === "way")
      .forEach((way) => {
        if (
          distance(nodesMap.get(way.nodes[0]), startAndDestination[0]) <
          currDiffFromStart
        ) {
          startNode = nodesMap.get(way.nodes[0]);
          startWay = way;
          currDiffFromStart = distance(
            nodesMap.get(way.nodes[0]),
            startAndDestination[0]
          );
        }
        if (
          distance(nodesMap.get(way.nodes[0]), startAndDestination[1]) <
          currDiffFromEnd
        ) {
          endNode = nodesMap.get(way.nodes[0]);
          currDiffFromEnd = distance(
            nodesMap.get(way.nodes[0]),
            startAndDestination[1]
          );
        }
        ways.push(way);
        drawWay(way, 0x952547);
      });
    //creating adjecency list
    const adjList = new Map();
    osmData.elements
      .filter((element) => element.type === "node")
      .forEach((node) => {
        adjList.set(node.id, []);
      });
    osmData.elements
      .filter((element) => element.type === "node")
      .forEach((node) => {
        ways.forEach((way) => {
          if (way.nodes.includes(node.id)) {
            const index = way.nodes.indexOf(node.id);
            if (index > 0) {
              adjList.get(node.id).push(way.nodes[index - 1]);
            }
            if (index < way.nodes.length - 1) {
              adjList.get(node.id).push(way.nodes[index + 1]);
            }
          }
        });
      });
    //console.log(adjList);

    console.log("Start and End coordinates", startAndDestination);
    console.log("Start node: ", startNode, "\nEnd node: ", endNode);
    //drawing start and end nodes
    const startNodeGraphics = new PIXI.Graphics();
    startNodeGraphics.beginFill(0xeb2662);
    startNodeGraphics.drawCircle(
      convertCoordinates(startNode).x,
      convertCoordinates(startNode).y,
      5
    );
    startNodeGraphics.endFill();
    app.stage.addChild(startNodeGraphics);

    const endNodeGraphics = new PIXI.Graphics();
    endNodeGraphics.beginFill(0xeb2662);
    endNodeGraphics.drawCircle(
      convertCoordinates(endNode).x,
      convertCoordinates(endNode).y,
      5
    );
    endNodeGraphics.endFill();
    app.stage.addChild(endNodeGraphics);

    let visited = new Set([startNode.id]);
    let queue = [startNode.id];
    let parent = new Map([[startNode.id, null]]);
    function animationLoop(delta) {
      app.render();

      let queueShift = 0;
      queue.forEach((queueElement) => {
        queueShift++;
        adjList.get(queueElement).forEach((nodeId) => {
          drawEdge(nodesMap.get(queueElement), nodesMap.get(nodeId), {
            width: 1,
            color: 0x00ff00,
            alpha: 1,
          });
          if (!visited.has(nodeId)) {
            visited.add(nodeId);
            queue.push(nodeId);
            parent.set(nodeId, queueElement);

            if (nodeId === endNode.id) {
              drawPath(nodeId);
              app.ticker.remove(animationLoop);
            }
          }
        });
      });
      queue.splice(0, queueShift);
      //console.log(delta);
    }

    function drawPath(nodeId) {
      if (parent.get(nodeId) === null) {
        return;
      }
      // draw neonish edges
      drawEdge(nodesMap.get(nodeId), nodesMap.get(parent.get(nodeId)), {
        width: 2,
        color: 0x8888ff,
        alpha: 1,
      });
      drawEdge(nodesMap.get(nodeId), nodesMap.get(parent.get(nodeId)), {
        width: 5,
        color: 0x0000ff,

        alpha: 0.5,
      });
      drawPath(parent.get(nodeId));
    }

    app.ticker.maxFPS = 2;
    app.ticker.add(animationLoop);

    return () => app.destroy(true);
  }, [osmData]);

  //console.log(osm);
  return <div id="pixi-container"></div>;
};

//0x952547
//0x00ff00
