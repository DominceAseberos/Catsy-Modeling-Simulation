import simpy
import simpy.rt
import random
from .cafe_env import CafeEnvironment

def start_simulation(event_queue, config, speed_factor=1.0):
    """
    Runs the SimPy RealtimeEnvironment in the current thread.
    speed_factor = 1.0 means 1 simulation second = 1 real second.
    """
    env = simpy.rt.RealtimeEnvironment(factor=speed_factor, strict=False)
    cafe = CafeEnvironment(env, event_queue, config)
    env.process(cafe.run())
    env.process(cafe.tick_timer())
    
    if config.get("warmup_time", 0) > 0:
        env.process(cafe.warmup_timer())
    
    # Run indefinitely
    try:
        env.run()
    except Exception as e:
        print("Simulation stopped:", e)

def run_batch_simulation(config, replications=50, sim_time_seconds=3600):
    """
    Runs headless, fast-forwarded simulations for statistical analysis.
    sim_time_seconds defaults to 1 hour (3600s).
    """
    global_wait = []
    global_cycle = []
    global_throughput = []
    global_lost = []
    
    warmup = config.get("warmup_time", 0)
    active_time = sim_time_seconds - warmup
    
    for r in range(replications):
        random.seed(r)
        
        # Use standard environment (fast-forward)
        env = simpy.Environment()
        
        # event_queue=None means emit() will safely ignore UI events
        cafe = CafeEnvironment(env, None, config)
        env.process(cafe.run())
        
        if warmup > 0:
            env.process(cafe.warmup_timer())
            
        env.run(until=sim_time_seconds)
        
        if cafe.waiting_times:
            global_wait.append(sum(cafe.waiting_times) / len(cafe.waiting_times))
        if cafe.cycle_times:
            global_cycle.append(sum(cafe.cycle_times) / len(cafe.cycle_times))
            
        global_lost.append(cafe.lost_customers)
            
        if active_time > 0:
            throughput_per_sec = cafe.completed_customers / active_time
            throughput_per_hour = throughput_per_sec * 3600
            global_throughput.append(throughput_per_hour)
            
    # Assuming average ticket size of ₱180.00
    avg_ticket_size = 180.0
    avg_lost = float(sum(global_lost) / len(global_lost)) if global_lost else 0.0
    avg_completed = float(sum(global_throughput) / len(global_throughput)) * (sim_time_seconds / 3600) if global_throughput else 0.0
    
    return {
        "avg_wait_time": float(sum(global_wait) / len(global_wait)) if global_wait else 0.0,
        "avg_cycle_time": float(sum(global_cycle) / len(global_cycle)) if global_cycle else 0.0,
        "throughput_per_hour": float(sum(global_throughput) / len(global_throughput)) if global_throughput else 0.0,
        "avg_lost_customers": avg_lost,
        "revenue_generated": avg_completed * avg_ticket_size,
        "revenue_lost": avg_lost * avg_ticket_size,
        "replications": replications
    }
