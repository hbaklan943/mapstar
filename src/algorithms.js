//every search pops the node with the lowest priority from the queue, the
//algorithms only differ in how that priority is calculated
//cost: road distance from the start, toEnd: straight distance to the end,
//order: how many nodes were queued before this one
//requeue: when a node that is already in the queue gets queued again
export const algorithms = {
  astar: {
    name: "A*",
    requeue: "cheaper",
    priority: (cost, toEnd) => cost + toEnd,
  },
  dijkstra: {
    name: "Dijkstra",
    requeue: "cheaper",
    priority: (cost) => cost,
  },
  greedy: {
    name: "Greedy best-first",
    requeue: "never",
    priority: (cost, toEnd) => toEnd,
  },
  bfs: {
    name: "BFS",
    requeue: "never",
    priority: (cost, toEnd, order) => order,
  },
  dfs: {
    name: "DFS",
    requeue: "always",
    priority: (cost, toEnd, order) => -order,
  },
};
