import random
import simpy

def _get_prep_time_and_emit_pace(cafe, config):
    queue_len = len(cafe.baristas.get_queue)
    pace = "Steady"
    if queue_len >= 4:
        pace = "Peak"
    elif queue_len == 0:
        pace = "Quiet"
        
    cafe.emit("pace_change", "system", {"pace": pace})
    
    prep_mode = (config["prep_min"] + config["prep_max"]) / 2.0
    prep_time = random.triangular(config["prep_min"], config["prep_max"], prep_mode)
    
    if pace == "Peak":
        prep_time *= 0.75 # 25% reduction Batch Prep
        
    return prep_time

def handle_reservation_flow(env, cafe, name, config, arrival_time):
    cafe.emit("waiting_table", name, {"is_reservation": True})
    with cafe.reservation_tables.request() as req:
        if cafe.event_queue is None:
            yield req
        else:
            while True:
                results = yield req | env.timeout(15.0)
                if req in results:
                    break
            
        cafe.emit("seated_waiting_order", name, {"is_reservation": True})
        # Drink is already made and waiting for them
        yield env.timeout(1.0)
        cafe.emit("served", name)
        
        yield env.timeout(random.uniform(config["dwell_min"], config["dwell_max"]))
        
    cafe.emit("leave", name)
    if env.now > config.get("warmup_time", 0):
        cafe.cycle_times.append(env.now - arrival_time)
        cafe.completed_customers += 1

def handle_takeout_flow(env, cafe, name, config, arrival_time):
    cafe.emit("waiting_pickup", name)
    
    barista_req = cafe.baristas.get()
    if cafe.event_queue is None:
        barista_idx = yield barista_req
    else:
        while True:
            results = yield barista_req | env.timeout(60.0)
            if barista_req in results:
                barista_idx = results[barista_req]
                break
            cafe.emit("prep_waiting_frustration", name)
        
    prep_time = _get_prep_time_and_emit_pace(cafe, config)
    cafe.emit("start_prep", name, {
        "barista_index": barista_idx,
        "duration": prep_time
    })
    
    if cafe.event_queue is None:
        yield env.timeout(prep_time)
    else:
        elapsed = 0.0
        while elapsed < prep_time:
            chunk = min(60.0, prep_time - elapsed)
            yield env.timeout(chunk)
            elapsed += chunk
            if elapsed < prep_time:
                cafe.emit("prep_waiting_frustration", name)
            
    cafe.baristas.put(barista_idx) # Free the barista
    
    cafe.emit("served", name)
    cafe.emit("leave", name)
    
    if env.now > config.get("warmup_time", 0):
        cafe.cycle_times.append(env.now - arrival_time)
        cafe.completed_customers += 1

def handle_dine_in_flow(env, cafe, name, config, arrival_time):
    cafe.emit("waiting_table", name, {"is_reservation": False})
    
    def make_drink():
        barista_req = cafe.baristas.get()
        if cafe.event_queue is None:
            barista_idx = yield barista_req
        else:
            while True:
                results = yield barista_req | env.timeout(60.0)
                if barista_req in results:
                    barista_idx = results[barista_req]
                    break
                cafe.emit("prep_waiting_frustration", name)
            
        prep_time = _get_prep_time_and_emit_pace(cafe, config)
        cafe.emit("start_prep", name, {
            "barista_index": barista_idx,
            "duration": prep_time
        })
        
        if cafe.event_queue is None:
            yield env.timeout(prep_time)
        else:
            elapsed = 0.0
            while elapsed < prep_time:
                chunk = min(60.0, prep_time - elapsed)
                yield env.timeout(chunk)
                elapsed += chunk
                if elapsed < prep_time:
                    cafe.emit("prep_waiting_frustration", name)
                
        cafe.baristas.put(barista_idx) # Free the barista
        
    # Start making the drink concurrently
    env.process(make_drink())
    
    with cafe.regular_tables.request() as req:
        if cafe.event_queue is None:
            yield req
        else:
            while True:
                results = yield req | env.timeout(60.0)
                if req in results:
                    break
                cafe.emit("prep_waiting_frustration", name)
                
        cafe.emit("seated_waiting_order", name, {"is_reservation": False})
        yield env.timeout(2.0) # Time to sit and receive drink
        cafe.emit("served", name)
        
        yield env.timeout(random.uniform(config["dwell_min"], config["dwell_max"]))
        
    cafe.emit("leave", name)
    if env.now > config.get("warmup_time", 0):
        cafe.cycle_times.append(env.now - arrival_time)
        cafe.completed_customers += 1

def customer_process(env, cafe, name, config):
    cafe.emit("arrive", name)
    arrival_time = env.now
    
    # Spend a moment walking into the shop
    yield env.timeout(random.uniform(1.0, 2.0))
    
    is_takeout = random.random() < config.get("takeout_prob", 0.5)
    is_reservation = False
    if not is_takeout and config.get("res_table_count", 0) > 0:
        is_reservation = random.random() < config.get("res_prob", 0.0)
        
    if is_reservation:
        yield from handle_reservation_flow(env, cafe, name, config, arrival_time)
        return
        
    # Find shortest cashier queue
    shortest_queue_idx = 0
    min_len = cafe.cashiers[0].count + len(cafe.cashiers[0].queue)
    for i in range(1, len(cafe.cashiers)):
        q_len = cafe.cashiers[i].count + len(cafe.cashiers[i].queue)
        if q_len < min_len:
            min_len = q_len
            shortest_queue_idx = i
            
    # Balking logic
    if min_len >= 8:
        if random.random() < config.get("balk_prob", 0.5): 
            cafe.emit("balking_start", name)
            yield env.timeout(random.uniform(4.0, 8.0))
            cafe.emit("balk_leave", name)
            if env.now > config.get("warmup_time", 0):
                cafe.lost_customers += 1
            return
            
    cafe.emit("queue_cashier", name, {"cashier_index": shortest_queue_idx})
    target_cashier = cafe.cashiers[shortest_queue_idx]
    
    will_renege = random.random() < config.get("renege_prob", 0.3)
    max_strikes = random.randint(1, config.get("max_strikes", 3)) if will_renege else float('inf')
    patience_interval = random.uniform(15.0, 30.0)
    strikes = 0
    
    with target_cashier.request() as req:
        if cafe.event_queue is None:
            if will_renege:
                total_patience = sum(random.uniform(15.0, 30.0) for _ in range(max_strikes))
                results = yield req | env.timeout(total_patience)
                if req in results:
                    wait_time = env.now - arrival_time
                    if env.now > config.get("warmup_time", 0):
                        cafe.waiting_times.append(wait_time)
                else:
                    if env.now > config.get("warmup_time", 0):
                        cafe.lost_customers += 1
                    return
            else:
                yield req
                wait_time = env.now - arrival_time
                if env.now > config.get("warmup_time", 0):
                    cafe.waiting_times.append(wait_time)
        else:
            while True:
                results = yield req | env.timeout(patience_interval)
                
                if req in results:
                    wait_time = env.now - arrival_time
                    if env.now > config.get("warmup_time", 0):
                        cafe.waiting_times.append(wait_time)
                    break 
                    
                position = -1
                if req in target_cashier.queue:
                    position = target_cashier.queue.index(req)
                    
                if position >= 0 and position <= 2:
                    cafe.emit("frustrated_waiting", name)
                    yield req 
                    break
                
                strikes += 1
                if strikes >= max_strikes:
                    cafe.emit("renege_leave", name, {"cashier_index": shortest_queue_idx})
                    if env.now > config.get("warmup_time", 0):
                        cafe.lost_customers += 1
                    return
                else:
                    cafe.emit("patience_warning", name, {"strike": strikes, "max": max_strikes})
        
        decide_time = random.uniform(config["decide_min"], config["decide_max"])
        pay_time = random.uniform(config["pay_min"], config["pay_max"])
        total_cashier_time = decide_time + pay_time
        
        cafe.emit("start_deciding", name, {"cashier_index": shortest_queue_idx, "duration": total_cashier_time})
        yield env.timeout(decide_time)
        
        cafe.emit("start_paying", name, {"cashier_index": shortest_queue_idx})
        yield env.timeout(pay_time)
    
    if is_takeout:
        yield from handle_takeout_flow(env, cafe, name, config, arrival_time)
    else:
        yield from handle_dine_in_flow(env, cafe, name, config, arrival_time)
