import simpy
import random
from .customer_flows import customer_process

class CafeEnvironment:
    def __init__(self, env, event_queue, config):
        self.env = env
        self.event_queue = event_queue
        self.config = config
        
        self.cashiers = [simpy.Resource(env, capacity=1) for _ in range(config["cashier_count"])]
        
        # Use a Store to track specific barista IDs
        self.baristas = simpy.Store(env, capacity=config["barista_count"])
        for i in range(config["barista_count"]):
            self.baristas.put(i)
            
        self.regular_tables = simpy.Resource(env, capacity=max(1, config.get("table_count", 1)))
        self.reservation_tables = simpy.Resource(env, capacity=max(1, config.get("res_table_count", 0)))
        
        self.customer_count = 0
        
        # KPI Tracking
        self.waiting_times = []
        self.cycle_times = []
        self.completed_customers = 0
        self.lost_customers = 0

    def emit(self, event_type, customer_id, extra=None):
        if self.event_queue is None:
            return
            
        payload = {
            "time": round(self.env.now, 2),
            "event": event_type,
            "customer_id": customer_id
        }
        if extra:
            payload.update(extra)
        
        try:
            self.event_queue.put_nowait(payload)
        except Exception:
            pass 

    def run(self):
        # Spawning loop
        while True:
            # Deterministic/Exponential arrival
            arrival_interval = random.expovariate(1.0 / self.config["avg_arrival_time"])
            yield self.env.timeout(arrival_interval)
            
            self.customer_count += 1
            name = f"Cust-{self.customer_count}"
            self.env.process(customer_process(self.env, self, name, self.config))

    def warmup_timer(self):
        yield self.env.timeout(self.config["warmup_time"])
        self.emit("warmup_complete", "System")

    def tick_timer(self):
        while True:
            self.emit("tick", "System")
            yield self.env.timeout(0.1)
