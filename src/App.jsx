import { useState } from "react";
import "./App.css";
import { useEffect } from "react";
import { PixiComponent } from "./PixiComponent";

function App() {
  let [startAndDestination, setStartAndDestination] = useState(["", ""]);
  let [bounds, setBounds] = useState([
    40.77599992917774, 29.392805099487305, 40.783799098523986,
    29.399113655090332,
  ]);
  let [osm, setOsm] = useState(null);

  useEffect(() => {
    if (startAndDestination[0] != "" && startAndDestination[1] != "")
      fetchOsm(bounds);
  }, [bounds]);

  function handleSubmit(e) {
    e.preventDefault();
    let start = startAndDestination[0].split(", ").map(Number);
    let destination = startAndDestination[1].split(", ").map(Number);
    console.log(start, destination);
    setBounds([
      Math.min(start[0], destination[0]) - 0.003,
      Math.min(start[1], destination[1]) - 0.003,
      Math.max(start[0], destination[0]) + 0.003,
      Math.max(start[1], destination[1]) + 0.003,
    ]);
  }
  function fetchOsm(bounds) {
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
        console.log(data);
        setOsm(data);
      });
    });
  }

  return (
    <>
      {osm ? (
        <PixiComponent osm={osm} />
      ) : (
        <div className="App">
          <header className="App-header">
            <h1>React App</h1>
          </header>

          <form onSubmit={handleSubmit}>
            <p>start coordinates: {startAndDestination[0]}</p>
            <input
              onChange={(e) =>
                setStartAndDestination([e.target.value, startAndDestination[1]])
              }
              value={startAndDestination[0]}
              type="text"
              name="start"
            />
            <p>destination coordinates: {startAndDestination[1]}</p>
            <input
              name="destination"
              onChange={(e) =>
                setStartAndDestination([startAndDestination[0], e.target.value])
              }
              value={startAndDestination[1]}
              type="text"
            />
            <p>
              <button id="login-button" type="submit">
                Submit
              </button>
            </p>
          </form>

          <div className="App-body">
            <p>osm: {osm?.elements.length}</p>
          </div>
        </div>
      )}
    </>
  );
}
export default App;
