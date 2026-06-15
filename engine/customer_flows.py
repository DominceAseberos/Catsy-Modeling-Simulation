import random
import simpy

def _get_prep_time_and_emit_pace(cafe, config):
    barista_queue = len(cafe.baristas.get_queue)
    cashier_queues = sum(len(c.queue) for c in cafe.cashiers)
    total_waiting = barista_queue + cashier_queues
    
    pace = "Steady"
    if total_waiting >= 6:
        pace = "Peak"
    elif total_waiting == 0:
        pace = "Quiet"
        
    cafe.emit("pace_change", "system", {"pace": pace})
    
    prep_mode = (config["prep_min"] + config["prep_max"]) / 2.0
    prep_time = random.triangular(config["prep_min"], config["prep_max"], prep_mode)
    
    if pace == "Peak":
        prep_time *= 0.75 # 25% reduction Batch Prep
        
    return prep_time

def handle_reservation_flow(env, cafe, name, config, arrival_time):
    # VIPs bypass the queue and instantly check-in at the first cashier desk
    cafe.emit("vip_checkin", name, {"cashier_index": 0})
    yield env.timeout(2.0) # 2 seconds to allow the ticket animation to finish
    
    # Check if their reserved table is still waiting for them!
    my_table = next((t for t in cafe.tables if t["status"] == "reserved" and t["reserved_for"] == name), None)
    
    if not my_table:
        # Oh no! They missed the window. They take their pre-made drink and leave immediately.
        cafe.emit("missed_reservation", name)
        cafe.emit("served", name)
        yield env.timeout(1.0)
        cafe.emit("leave", name)
        return
        

    # Claim the table
    my_table["status"] = "occupied"
    my_table["reserved_for"] = None
    cafe.emit("seated_waiting_order", name, {"is_reservation": True, "table_id": my_table["id"]})
    
    # Drink is already made and waiting for them
    yield env.timeout(1.0)
    cafe.emit("served", name)
    
    yield env.timeout(random.uniform(config["dwell_min"], config["dwell_max"]))
    
    # Leave and free table
    my_table["status"] = "available"
    if env.now > config.get("warmup_time", 0):
        cafe.cycle_times.append(env.now - arrival_time)
        cafe.completed_customers += 1

def handle_takeout_flow(env, cafe, name, config, arrival_time):
    cafe.emit("waiting_pickup", name)
    
    barista_req = cafe.baristas.get()
    print(f"[{env.now:.1f}] {name} handle_takeout_flow requesting barista...")
    if cafe.event_queue is None:
        barista_idx = yield barista_req
        print(f"[{env.now:.1f}] {name} got barista (headless)")
    else:
        while True:
            results = yield barista_req | env.timeout(60.0)
            if barista_req in results:
                barista_idx = results[barista_req]
                print(f"[{env.now:.1f}] {name} got barista {barista_idx}")
                break
            print(f"[{env.now:.1f}] {name} still waiting for barista...")
            cafe.emit("prep_waiting_frustration", name)
        
    print(f"[{env.now:.1f}] {name} getting prep time...")
    prep_time = _get_prep_time_and_emit_pace(cafe, config)
    print(f"[{env.now:.1f}] {name} emitting start_prep...")
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
    
    drink_ready_event = env.event()
    
    def make_drink():
        barista_req = cafe.baristas.get()
        print(f"[{env.now:.1f}] {name} make_drink requesting barista...")
        if cafe.event_queue is None:
            barista_idx = yield barista_req
            print(f"[{env.now:.1f}] {name} got barista (headless)")
        else:
            while True:
                results = yield barista_req | env.timeout(60.0)
                if barista_req in results:
                    barista_idx = results[barista_req]
                    print(f"[{env.now:.1f}] {name} got barista {barista_idx}")
                    break
                print(f"[{env.now:.1f}] {name} still waiting for barista...")
                cafe.emit("prep_waiting_frustration", name)
            
        print(f"[{env.now:.1f}] {name} getting prep time...")
        prep_time = _get_prep_time_and_emit_pace(cafe, config)
        print(f"[{env.now:.1f}] {name} emitting start_prep...")
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
        cafe.emit("finish_prep", name) # Tell UI the barista is done
        drink_ready_event.succeed()
        
    # Start making the drink concurrently
    env.process(make_drink())
    
    # Wait for a table to become available
    table = None
    while True:
        available = [t for t in cafe.tables if t["status"] == "available"]
        if available:
            table = random.choice(available)
            table["status"] = "occupied"
            break
        yield env.timeout(1.0)
        if cafe.event_queue:
            # Emit frustration periodically if waiting too long
            if random.random() < 0.1:
                cafe.emit("prep_waiting_frustration", name)
                
    cafe.emit("seated_waiting_order", name, {"is_reservation": False, "table_id": table["id"]})
    
    # Wait for the barista to actually finish making the drink
    yield drink_ready_event
    
    yield env.timeout(2.0) # Time to receive drink
    cafe.emit("served", name)
    
    yield env.timeout(random.uniform(config["dwell_min"], config["dwell_max"]))
    
    table["status"] = "available"
        
    cafe.emit("leave", name)
    if env.now > config.get("warmup_time", 0):
        cafe.cycle_times.append(env.now - arrival_time)
        cafe.completed_customers += 1

def customer_process(env, cafe, name, config, force_takeout=False, is_reservation=False):
    cafe.emit("arrive", name)
    arrival_time = env.now
    
    # Spend a moment walking into the shop
    yield env.timeout(random.uniform(1.0, 2.0))
    
    if is_reservation:
        yield from handle_reservation_flow(env, cafe, name, config, arrival_time)
        return
        
    base_takeout_prob = config.get("takeout_prob", 0.5)
    
    # Check dynamic table capacity to influence takeout prob
    available_tables = len([t for t in cafe.tables if t["status"] == "available"])
    if available_tables > 0:
        effective_takeout_prob = max(0.1, base_takeout_prob * 0.5)
    else:
        effective_takeout_prob = min(0.95, base_takeout_prob * 1.5)
        
    is_takeout = force_takeout or (random.random() < effective_takeout_prob)
        
    # Find shortest cashier queue
    shortest_queue_idx = 0
    min_len = cafe.cashiers[0].count + len(cafe.cashiers[0].queue)
    for i in range(1, len(cafe.cashiers)):
        q_len = cafe.cashiers[i].count + len(cafe.cashiers[i].queue)
        if q_len < min_len:
            min_len = q_len
            shortest_queue_idx = i
            
    # Balking logic
    if min_len >= config.get("balk_threshold", 8):
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
