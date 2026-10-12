# Mapstar (Map-A*?)

Pathfinding algorithms animated on real roads.

- Pick the start and the destination by clicking the map (or type the coordinates).
- Roads of the area are fetched from OpenStreetMap through the Overpass API.
- The search is drawn step by step in a Pixi stage on top of the Leaflet map, then the found route flows from the start to the destination.
- Algorithms: A\*, Dijkstra, Greedy best-first, BFS and DFS. Switching the algorithm or pressing Replay runs the search again on the same roads.
- The status bar shows the route length and how many nodes the search explored.
- Don't pick points that are too far apart, the public Overpass servers are slow and the whole area has to be downloaded.

## Running

```bash
pnpm install
pnpm dev
```

## Credits

Map tiles by Esri, road data by OpenStreetMap contributors.

https://github.com/hbaklan943/maptar/assets/39270324/bb4917e6-d868-49cb-8268-99e3991c76d0


![image](https://github.com/hbaklan943/maptar/assets/39270324/4c44a8cf-f445-4e4d-a288-dcb43cebd57b)

