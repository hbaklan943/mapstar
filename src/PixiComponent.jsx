import { useEffect } from "react";
import * as PIXI from "pixi.js";

export const PixiComponent = ({ osmData, bounds }) => {
  useEffect(() => {
    const [width, height] = [1080, 720];
    const app = new PIXI.Application({ width, height });
    document.getElementById("pixi-container").appendChild(app.view);

    // create function to convert node coordinates to pixi coordinates
    const convertCoordinates = (node) => {
      const x = (height / (bounds[3] - bounds[1])) * (node.lon - bounds[1]);
      const y =
        width - (width / (bounds[2] - bounds[0])) * (node.lat - bounds[0]);
      //console.log(bounds);
      //console.log(x, y);
      return new PIXI.Point(x, y);
    };

    const ways = osmData.elements.filter((element) => element.type === "way");
    const nodesMap = new Map(
      osmData.elements
        .filter((element) => element.type === "node")
        .map((node) => [node.id, node])
    );
    //console.log(nodesMap);

    osmData.elements
      .filter((element) => element.type === "way")
      .forEach((way) => {
        const wayGraphics = new PIXI.Graphics();
        wayGraphics.lineStyle(2, 0xffa600, 0.5); // Adjust line style as needed
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
      });

    return () => app.destroy(true);
  }, [osmData]);

  //console.log(osm);
  return <div id="pixi-container"></div>;
};
