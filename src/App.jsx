import { useState } from "react";
import "./App.css";
import { useEffect } from "react";
import { PixiComponent } from "./PixiComponent";

function App() {
  let [boundsReady, setBoundsReady] = useState(false);
  const [inputs, setInputs] = useState([
    "40.786552, 29.334057",
    "40.79264, 29.337854",
  ]);
  let [startAndDestination, setStartAndDestination] = useState([
    { lat: 40.786552, lon: 29.334057 },
    { lat: 40.79264, lon: 29.337854 },
  ]);
  let [bounds, setBounds] = useState([
    40.77599992917774, 29.392805099487305, 40.783799098523986,
    29.399113655090332,
  ]);
  let [osmData, setOsmData] = useState(null);

  useEffect(() => {
    if (boundsReady) fetchOsmData(bounds);
  }, [bounds]);

  function handleSubmit(e) {
    e.preventDefault();

    let start = startAndDestination[0];
    //console.log(start);
    let destination = startAndDestination[1];
    //console.log(start, destination);

    //finding proper bounds
    const frame = {
      lowerBound: Math.min(start.lat, destination.lat),
      leftBound: Math.min(start.lon, destination.lon),
      upperBound: Math.max(start.lat, destination.lat),
      rightBound: Math.max(start.lon, destination.lon),
    };
    let margin = 0.01;
    const verticalDistance = Math.abs(start.lat - destination.lat);
    const horizontalDistance = Math.abs(start.lon - destination.lon);
    const verticalMid = (start.lat + destination.lat) / 2;
    const horizontalMid = (start.lon + destination.lon) / 2;
    if (verticalDistance / 720 > horizontalDistance / 1280) {
      frame.lowerBound -= margin;
      frame.leftBound =
        horizontalMid - ((verticalDistance / 2 + margin) / 720) * 1280;
      frame.upperBound += margin;
      frame.rightBound =
        horizontalMid + ((verticalDistance / 2 + margin) / 720) * 1280;
    } else {
      frame.lowerBound =
        verticalMid - ((horizontalDistance / 2 + margin) / 1280) * 720;
      frame.leftBound -= 0.02;
      frame.upperBound =
        verticalMid + ((horizontalDistance / 2 + margin) / 1280) * 720;
      frame.rightBound += 0.02;
    }

    //console.log(startAndDestination);
    //console.log(frame);
    setBounds([
      frame.lowerBound, // lower
      frame.leftBound, // left
      frame.upperBound, // upper
      frame.rightBound, // right
    ]);
    setBoundsReady(true);
  }
  function fetchOsmData(bounds) {
    fetch("https://overpass-api.de/api/interpreter", {
      headers: {
        accept: "*/*",
        "accept-language": "en-US,en;q=0.8",
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "sec-ch-ua": '"Brave";v="117", "Not;A=Brand";v="8", "Chromium";v="117"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Linux"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "cross-site",
        "sec-gpc": "1",
        Referer: "https://overpass-turbo.eu/",
        "Referrer-Policy": "strict-origin-when-cross-origin",
      },
      body: `data=%5Bout%3Ajson%5D%5Btimeout%3A25%5D%3B%0A(%0A++way%5B%22highway%22%5D(${bounds[0]}, ${bounds[1]}, ${bounds[2]}, ${bounds[3]})%3B%0A)%3B%0Aout+body%3B%0A%3E%3B%0Aout+skel+qt%3B`,
      method: "POST",
    }).then((res) => {
      res.json().then((data) => {
        //console.log(data);
        setOsmData(data);
      });
    });
  }

  return (
    <>
      {osmData ? (
        <PixiComponent
          osmData={osmData}
          bounds={bounds}
          startAndDestination={startAndDestination}
        />
      ) : (
        <div className="App">
          <header className="App-header">
            <h1>React App</h1>
          </header>

          <form onSubmit={handleSubmit}>
            <p>start coordinates: {inputs[0]}</p>
            <input
              onChange={(e) => {
                setInputs([e.target.value, inputs[1]]);
                setStartAndDestination([
                  {
                    lat: parseFloat(e.target.value.split(",")[0]),
                    lon: parseFloat(e.target.value.split(",")[1]),
                  },
                  startAndDestination[1],
                ]);
              }}
              value={inputs[0]}
              type="text"
              name="start"
            />
            <p>destination coordinates: {inputs[1]}</p>
            <input
              name="destination"
              onChange={(e) => {
                setInputs([inputs[0], e.target.value]);
                setStartAndDestination([
                  startAndDestination[0],
                  {
                    lat: parseFloat(e.target.value.split(",")[0]),
                    lon: parseFloat(e.target.value.split(",")[1]),
                  },
                ]);
              }}
              value={inputs[1]}
              type="text"
            />
            <p>
              <button id="login-button" type="submit">
                Submit
              </button>
            </p>
          </form>
        </div>
      )}
    </>
  );
}
export default App;
