# Video 1: Welcome

- two ways to speed up a program: 1. reduce # of instructions to CPU, 2. increase speed of instructions through CPU.

# Video 2: Waste

- no. 1 reason programs get slow is because of waste: unnecessary instructions that don't have anything to do with the program you wrote.
- a simple add in python runs hundreds (~181) of assembly instructions as waste.
  - i imagine this is because of untyped management and everything being an object, python has to dereference, check the type, check the operation is valid, and then write it to a new object (and allocate this memory).
- 130x in terms of python runtime over C code (and the 180x waste) for simple things like ADD.

# Video 3:

- IPC: Instructions Per Clock
  - avg # of instructions CPU executes on every clock cycle.
- ILP: Instruction Level Parallelism
  - ability to do some number of instructions at the same time.
- ‘unrolling' a for loop removes the intermediate comparisons we do when doing the operations in the body of the loop.
- summing up an array of values is a ‘serial dependency chain’ where every ADD is dependent on the previous one so everything in the chain is dependent and it cannot be parallelized.
  - the only thing it can do in parallel is loop maintenance (such as comparison), because they do not rely on the add being computed.


# Video 4:

- Single Instruction, Multiple Data (SIMD)
- SSE instruction set supported SIMD. For example you can have custom ADD instructions like PADDD that allows you to do multiple ADDs at once.
  - this is very similar to a micro-GPU or something – GPU with low-memory and bandwidth.
- Why do this? This avoids the CPU having to analyze the instruction stream and decide how to order instructions, and instead just do it once by running the instruction.
- Others from SSE: AVX, AVX-512 (each widen the size of the lanes: 4, 8, 16).
  - these are for 32-bit values, but if you reduce to 16-bit or 8-bit you can 2x, 4x the number of parallel lanes.
  - so for a 2-bit number you could get 16*2^5 = 512 parallel adds. Interesting.
  - example of use SIMD instructions to speed up a simple DeepLearning flow on a CPU: https://technology.inmobi.com/articles/2025/07/08/leveraging-java-vector-apis-to-optimise-neural-network-inferencing
  - code: https://github.com/InMobi/dense-layer-benchmark/blob/main/src/main/java/benchmark/DenseLayerBenchmark.java
  - ridiculously-fast unicode validation: https://lemire.me/blog/2020/10/20/ridiculously-fast-unicode-utf-8-validation/
  - parsing gigabytes of JSON per second: https://branchfree.org/2019/02/25/paper-parsing-gigabytes-of-json-per-second/
- these results are all subject to GOOD cache behavior: the size of the array was set so that the cache hits were GOOD.

# Video 5:

- speed of LOAD (getting a value), is determined by the Cache.
  - first looks for L1 cache that is inside the CPU Core and is closest to the Register File (about 3-4 cycles to go to L1). 32K of memory.
  - L2 (256K, ~14 cycles)
  - L3 (8MB, ~80 cycles)
  - then main memory (100+ cycles generally)
- Register File is a very fast access of values as fast-as-possible. It is a very small piece of memory.
- There is a split between L2/L3 (each core for multicore has an L1 and L2 for itself, but the L3 after the split is shared between cores).