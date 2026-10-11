import { useState } from "react";
import "./App.css";
import { MapPicker } from "./MapPicker";
import { algorithms } from "./algorithms";

function isValidCoordinate({ lat, lon }) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180
  );
}

//public Overpass servers, they are busy or down on and off
const overpassUrls = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

//all servers are asked at once and the first answer wins
async function requestOsmData(bounds) {
  const body = new URLSearchParams({
    data: `[out:json][timeout:25];way["highway"](${bounds.join(
      ",",
    )});out body;>;out skel qt;`,
  });
  const controller = new AbortController();
  const deadline = Date.now() + 30000;

  //a server that fails gets asked again a few times
  const askServer = async (url) => {
    let lastError;
    for (let attempt = 0; attempt < 6 && Date.now() < deadline; attempt++) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 700));
      if (controller.signal.aborted) break;
      try {
        const res = await fetch(url, {
          method: "POST",
          body,
          signal: controller.signal,
        });
        if (res.ok) return await res.json();
        lastError = new Error(`Overpass API returned ${res.status}`);
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError;
  };

  try {
    return await Promise.any(overpassUrls.map(askServer));
  } catch (err) {
    throw err.errors[0];
  } finally {
    controller.abort();
  }
}

function App() {
  let [loading, setLoading] = useState(false);
  let [error, setError] = useState(null);
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
  let [replayCount, setReplayCount] = useState(0);
  let [algorithm, setAlgorithm] = useState("astar");

  function handlePick(index, point) {
    setInputs((inputs) => {
      const newInputs = [...inputs];
      newInputs[index] = `${point.lat.toFixed(6)}, ${point.lon.toFixed(6)}`;
      return newInputs;
    });
    setStartAndDestination((startAndDestination) => {
      const newStartAndDestination = [...startAndDestination];
      newStartAndDestination[index] = point;
      return newStartAndDestination;
    });
  }

  function handleSubmit(e) {
    e.preventDefault();

    let start = startAndDestination[0];
    //console.log(start);
    let destination = startAndDestination[1];
    //console.log(start, destination);

    if (!isValidCoordinate(start) || !isValidCoordinate(destination)) {
      setError('Enter coordinates as "latitude, longitude"');
      return;
    }

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
    const newBounds = [
      frame.lowerBound, // lower
      frame.leftBound, // left
      frame.upperBound, // upper
      frame.rightBound, // right
    ];
    setBounds(newBounds);
    fetchOsmData(newBounds);
  }
  function fetchOsmData(bounds) {
    setError(null);
    setLoading(true);
    requestOsmData(bounds)
      .then((data) => {
        //console.log(data);
        if (!data.elements.some((element) => element.type === "way"))
          throw new Error("No roads found in this area");
        setOsmData(data);
      })
      .catch((err) => setError(`Could not load map data: ${err.message}`))
      .finally(() => setLoading(false));
  }

  const algorithmSelect = (
    <select
      value={algorithm}
      onChange={(e) => setAlgorithm(e.target.value)}
      aria-label="algorithm"
    >
      {Object.entries(algorithms).map(([id, { name }]) => (
        <option key={id} value={id}>
          {name}
        </option>
      ))}
    </select>
  );

  return (
    <div className="App">
      <p>
        {error ??
          "Click the map to pick the start, click again to pick the destination."}
      </p>
      {osmData ? (
        <div className="controls">
          {algorithmSelect}
          <button onClick={() => setReplayCount(replayCount + 1)}>
            Replay
          </button>
          <button
            onClick={() => {
              setOsmData(null);
              setReplayCount(0);
            }}
          >
            New route
          </button>
        </div>
      ) : (
        <form className="controls" onSubmit={handleSubmit}>
          {algorithmSelect}
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
            aria-label="start coordinates"
          />
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
            aria-label="destination coordinates"
          />
          <button id="login-button" type="submit" disabled={loading}>
            {loading ? "Loading..." : "Submit"}
          </button>
        </form>
      )}

      <MapPicker
        startAndDestination={startAndDestination}
        onPick={handlePick}
        osmData={osmData}
        bounds={bounds}
        replayCount={replayCount}
        algorithm={algorithm}
      />
    </div>
  );
}
export default App;
