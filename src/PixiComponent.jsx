import { useEffect } from "react";
import * as PIXI from "pixi.js";

export const PixiComponent = ({ osm }) => {
  useEffect(() => {
    const app = new PIXI.Application({ width: 750, height: 600 });
    document.getElementById("pixi-container").appendChild(app.view);

    return () => app.destroy(true);
  }, [osm]);

  //console.log(osm);
  return <div id="pixi-container"></div>;
};
