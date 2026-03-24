"""
Seed script: org structure, users, partners, 12-month metrics, metric visibility.
Run from apps/server/:  python scripts/seed_partners.py
"""
from __future__ import annotations

import asyncio
import math
import os
import random
import uuid
from datetime import date

import asyncpg
from argon2 import PasswordHasher

# ── Config ────────────────────────────────────────────────────────────────────
DATABASE_URL = os.environ.get(
    "DATABASE_URL_SYNC",
    "postgresql://metadatahub:metadatahub@localhost:5432/metadatahub",
)
# asyncpg needs postgresql:// (not postgresql+asyncpg://)
_DB = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")

DUCKDB_PATH = os.environ.get("DUCKDB_PATH", "metadatahub_analytics.db")

_ph = PasswordHasher()
PARTNER_PASSWORD = _ph.hash("partner123")

random.seed(42)

# ── Org structure ─────────────────────────────────────────────────────────────
REGIONS = {
    "华东": {
        "head": "张伟（华东区域负责人）",
        "managers": [
            {"name": "李明（华东经理1）", "partners": ["杭州安恒信息", "上海云盾科技", "南京赛宁网安"]},
            {"name": "王芳（华东经理2）", "partners": ["苏州奇安信代理", "合肥深信服代理", "宁波天融信代理"]},
            {"name": "陈强（华东经理3）", "partners": ["无锡绿盟代理", "温州启明星辰代理", "福州安全狗科技"]},
        ],
    },
    "华中": {
        "head": "刘洋（华中区域负责人）",
        "managers": [
            {"name": "赵敏（华中经理1）", "partners": ["武汉虎符网安", "长沙麒麟信安", "郑州信大捷安"]},
            {"name": "孙磊（华中经理2）", "partners": ["南昌同盾科技", "合肥华云数据", "太原安恒代理"]},
            {"name": "周婷（华中经理3）", "partners": ["武汉极意云科", "长沙深信服代理", "郑州天融信代理"]},
        ],
    },
    "华北东北": {
        "head": "吴刚（华北东北区域负责人）",
        "managers": [
            {"name": "郑涛（华北经理1）", "partners": ["北京启明星辰代理", "天津奇安信代理", "大连东软集团"]},
            {"name": "林芸（华北经理2）", "partners": ["沈阳绿盟代理", "哈尔滨安天科技", "济南山石网科"]},
            {"name": "黄鹏（华北经理3）", "partners": ["石家庄深信服代理", "长春吉大正元", "青岛海泰方圆"]},
        ],
    },
    "华南": {
        "head": "许娜（华南区域负责人）",
        "managers": [
            {"name": "徐峰（华南经理1）", "partners": ["深圳腾讯云安全", "广州立鼎科技", "珠海金山云安全"]},
            {"name": "杨柳（华南经理2）", "partners": ["东莞华为代理", "佛山天融信代理", "厦门美亚柏科"]},
            {"name": "何诚（华南经理3）", "partners": ["南宁安恒代理", "海口深信服代理", "中山启明代理"]},
        ],
    },
    "西南西北": {
        "head": "马超（西南西北区域负责人）",
        "managers": [
            {"name": "高远（西南经理1）", "partners": ["成都知道创宇", "重庆启明星辰代理", "贵阳白山云科技"]},
            {"name": "罗敏（西南经理2）", "partners": ["昆明安恒代理", "西安交大捷普", "兰州飞天诚信"]},
            {"name": "谢军（西南经理3）", "partners": ["成都绿盟代理", "乌鲁木齐深信服代理", "银川奇安信代理"]},
        ],
    },
}

PARTNER_TIERS: dict[str, str] = {
    "杭州安恒信息": "strategic", "上海云盾科技": "strategic",
    "深圳腾讯云安全": "strategic", "北京启明星辰代理": "strategic",
    "南京赛宁网安": "core", "苏州奇安信代理": "core",
    "武汉虎符网安": "core", "长沙麒麟信安": "core",
    "天津奇安信代理": "core", "大连东软集团": "core",
    "广州立鼎科技": "core", "东莞华为代理": "core",
    "成都知道创宇": "core", "西安交大捷普": "core",
    "合肥深信服代理": "growth", "宁波天融信代理": "growth",
    "无锡绿盟代理": "growth", "郑州信大捷安": "growth",
    "南昌同盾科技": "growth", "合肥华云数据": "growth",
    "武汉极意云科": "growth", "沈阳绿盟代理": "growth",
    "哈尔滨安天科技": "growth", "济南山石网科": "growth",
    "珠海金山云安全": "growth", "佛山天融信代理": "growth",
    "厦门美亚柏科": "growth", "南宁安恒代理": "growth",
    "重庆启明星辰代理": "growth", "贵阳白山云科技": "growth",
    "兰州飞天诚信": "growth", "成都绿盟代理": "growth",
    "温州启明星辰代理": "observation", "福州安全狗科技": "observation",
    "太原安恒代理": "observation", "长沙深信服代理": "observation",
    "石家庄深信服代理": "observation", "长春吉大正元": "observation",
    "海口深信服代理": "observation", "昆明安恒代理": "observation",
    "乌鲁木齐深信服代理": "observation",
    "郑州天融信代理": "risk", "青岛海泰方圆": "risk",
    "中山启明代理": "risk", "银川奇安信代理": "risk",
}

ALL_ROLES = ["partner", "partner_manager", "region_head", "admin"]
MGR_UP = ["partner_manager", "region_head", "admin"]
ADMIN_ONLY = ["admin"]

METRIC_VISIBILITY = {
    "crm_revenue": ALL_ROLES, "mall_revenue": ALL_ROLES,
    "confirmed_income": MGR_UP, "collection_amount": MGR_UP,
    "collection_rate": ALL_ROLES, "order_count": ALL_ROLES,
    "mall_order_count": ALL_ROLES, "profit_rate": ADMIN_ONLY,
    "yoy_growth_rate": MGR_UP, "new_customer_count": MGR_UP,
    "new_customer_ratio": MGR_UP, "opportunity_conversion": ALL_ROLES,
    "innovation_ratio": ALL_ROLES, "saas_ratio": MGR_UP,
    "lead_count": ALL_ROLES, "lead_priority_ratio": ALL_ROLES,
    "certified_count": ALL_ROLES, "referred_partners": MGR_UP,
    "timely_collection_rate": ALL_ROLES, "overdue_ratio": MGR_UP,
    "standard_contract_ratio": MGR_UP, "standard_term_ratio": MGR_UP,
    "invoice_health_days": ALL_ROLES,
    "mall_login_freq": ALL_ROLES, "trial_requests": ALL_ROLES,
    "cttalk_freq": ALL_ROLES, "kb_access_freq": ALL_ROLES,
    "mall_shop_freq": ALL_ROLES,
}

BASE_BY_TIER = {
    "strategic":   {"revenue": 800,  "growth": 25,  "leads": 30, "health": 90, "active": 80},
    "core":        {"revenue": 500,  "growth": 15,  "leads": 20, "health": 80, "active": 60},
    "growth":      {"revenue": 250,  "growth": 8,   "leads": 12, "health": 70, "active": 45},
    "observation": {"revenue": 100,  "growth": -5,  "leads": 5,  "health": 55, "active": 25},
    "risk":        {"revenue": 40,   "growth": -15, "leads": 2,  "health": 35, "active": 10},
}


def _period(offset: int) -> str:
    year = 2024 + (3 + offset) // 12
    month = (3 + offset) % 12 + 1
    return f"{year}-{month:02d}"


def generate_metrics(tier: str) -> list[tuple]:
    base = BASE_BY_TIER[tier]
    rows: list[tuple] = []

    for offset in range(12):
        period = _period(offset)
        seasonal = 1.0 + 0.15 * math.sin(2 * math.pi * offset / 12)
        noise = random.uniform(0.85, 1.15)

        crm = max(0.0, base["revenue"] * seasonal * noise * random.uniform(0.7, 1.3))
        mall = crm * random.uniform(0.1, 0.4)
        coll_rate = min(100.0, max(20.0, base["health"] * random.uniform(0.8, 1.2)))
        confirmed = crm * coll_rate / 100 * random.uniform(0.8, 1.0)
        orders = max(1, int(crm / random.uniform(20, 60)))

        rows += [
            (period, "monthly", "performance", "crm_revenue",      "CRM签约金额",     round(crm, 2),  "万元"),
            (period, "monthly", "performance", "mall_revenue",      "商城签约金额",    round(mall, 2), "万元"),
            (period, "monthly", "performance", "confirmed_income",  "确认收入",        round(confirmed, 2), "万元"),
            (period, "monthly", "performance", "collection_amount", "回款金额",        round(confirmed * random.uniform(0.7, 1.0), 2), "万元"),
            (period, "monthly", "performance", "collection_rate",   "回款完成率",      round(coll_rate, 1), "%"),
            (period, "monthly", "performance", "order_count",       "订单数量",        float(orders),  "个"),
            (period, "monthly", "performance", "mall_order_count",  "商城订单数量",    float(max(0, int(orders * random.uniform(0.1, 0.4)))), "个"),
            (period, "monthly", "performance", "profit_rate",       "利润率",          round(random.uniform(15, 45), 1), "%"),
        ]

        yoy = base["growth"] * random.uniform(0.5, 1.5) + random.uniform(-5, 5)
        new_cust = max(0, int(base["leads"] * 0.3 * random.uniform(0.5, 2.0)))
        new_ratio = random.uniform(10, 60) if tier in ("strategic", "core") else random.uniform(5, 30)

        rows += [
            (period, "monthly", "growth", "yoy_growth_rate",       "同比增长率",       round(yoy, 1),  "%"),
            (period, "monthly", "growth", "new_customer_count",    "新客户数量",        float(new_cust), "个"),
            (period, "monthly", "growth", "new_customer_ratio",    "新客户占比",        round(new_ratio, 1), "%"),
            (period, "monthly", "growth", "opportunity_conversion","商机转化率",        round(random.uniform(15, 55), 1), "%"),
            (period, "monthly", "growth", "innovation_ratio",      "创新产品渗透率",    round(random.uniform(5, 40), 1),  "%"),
            (period, "monthly", "growth", "saas_ratio",            "高价值产出占比",    round(random.uniform(2, 25), 1),  "%"),
        ]

        leads = max(0, int(base["leads"] * seasonal * random.uniform(0.6, 1.5)))
        certs = max(0, int(random.uniform(1, 8) if tier in ("strategic", "core") else random.uniform(0, 4)))

        rows += [
            (period, "monthly", "engagement", "lead_count",         "商机报备数量",  float(leads), "个"),
            (period, "monthly", "engagement", "lead_priority_ratio","商机优先占比",  round(random.uniform(20, 70), 1), "%"),
            (period, "monthly", "engagement", "certified_count",    "认证人员数",    float(certs), "人"),
            (period, "monthly", "engagement", "referred_partners",  "推荐新伙伴数",  float(max(0, int(random.uniform(0, 3)))), "个"),
        ]

        timely = min(100.0, max(20.0, base["health"] * random.uniform(0.85, 1.15)))
        overdue = max(0.0, 100 - timely + random.uniform(-10, 10))

        rows += [
            (period, "monthly", "health", "timely_collection_rate", "回款及时率",       round(timely, 1),  "%"),
            (period, "monthly", "health", "overdue_ratio",          "逾期金额比例",      round(max(0.0, overdue), 1), "%"),
            (period, "monthly", "health", "standard_contract_ratio","标准签约占比",      round(random.uniform(50, 95), 1), "%"),
            (period, "monthly", "health", "standard_term_ratio",    "标准账期订单占比",  round(random.uniform(40, 90), 1), "%"),
            (period, "monthly", "health", "invoice_health_days",    "确收健康度",        round(random.uniform(3, 30), 1),  "天"),
        ]

        login_freq = random.uniform(0.5, 6) if tier != "risk" else random.uniform(0, 1.5)

        rows += [
            (period, "monthly", "activity", "mall_login_freq",  "万众访问频率",     round(login_freq, 1), "天/周"),
            (period, "monthly", "activity", "trial_requests",   "申请产品试用次数", float(max(0, int(random.uniform(0, 5)))), "次"),
            (period, "monthly", "activity", "cttalk_freq",      "CTtalk登录频率",   round(random.uniform(1, 15), 1), "人次/月"),
            (period, "monthly", "activity", "kb_access_freq",   "知识库访问频率",   round(random.uniform(0.5, 5), 1), "天/周"),
            (period, "monthly", "activity", "mall_shop_freq",   "万众商城访问频率", round(random.uniform(0.5, 4), 1), "天/周"),
        ]

    return rows


def make_email(name: str, suffix: str) -> str:
    import hashlib
    h = hashlib.md5(name.encode()).hexdigest()[:8]
    return f"{suffix}_{h}@metadatahub.local"


async def main() -> None:
    print(f"Connecting to {_DB} ...")
    conn = await asyncpg.connect(_DB)

    # ── Build IDs ──────────────────────────────────────────────────────────────
    head_ids: dict[str, uuid.UUID] = {}
    mgr_ids: dict[str, uuid.UUID] = {}
    partner_ids: dict[str, uuid.UUID] = {}
    head_user_ids: dict[str, uuid.UUID] = {}
    mgr_user_ids: dict[str, uuid.UUID] = {}
    partner_user_ids: dict[str, uuid.UUID] = {}

    for region in REGIONS:
        head_ids[region] = uuid.uuid4()
        head_user_ids[region] = uuid.uuid4()
        for mgr in REGIONS[region]["managers"]:
            mgr_ids[mgr["name"]] = uuid.uuid4()
            mgr_user_ids[mgr["name"]] = uuid.uuid4()
            for p in mgr["partners"]:
                partner_ids[p] = uuid.uuid4()
                partner_user_ids[p] = uuid.uuid4()

    async with conn.transaction():
        # ── users ──────────────────────────────────────────────────────────────
        user_rows = []
        for region, data in REGIONS.items():
            user_rows.append((
                head_user_ids[region], make_email(data["head"], "head"),
                data["head"], PARTNER_PASSWORD,
                "analyst", region, None, None, None, None, 1, True,
            ))
            for mgr in data["managers"]:
                user_rows.append((
                    mgr_user_ids[mgr["name"]], make_email(mgr["name"], "mgr"),
                    mgr["name"], PARTNER_PASSWORD,
                    "viewer", region, "partner_manager", None, None, None, 1, True,
                ))
                for p in mgr["partners"]:
                    user_rows.append((
                        partner_user_ids[p],
                        make_email(p, "partner"),
                        p, PARTNER_PASSWORD,
                        "partner", region, None, str(partner_ids[p]), None, None, 1, True,
                    ))

        await conn.executemany("""
            INSERT INTO users
              (id, email, name, password_hash, role, region, org_role,
               partner_id, department, org_node_id, permission_version, is_active)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
            ON CONFLICT (email) DO NOTHING
        """, user_rows)
        print(f"  users: {len(user_rows)}")

        # ── org_structure ──────────────────────────────────────────────────────
        org_rows = []
        for region, data in REGIONS.items():
            org_rows.append((head_ids[region], data["head"], "region_head", region, None, head_user_ids[region]))
        for region, data in REGIONS.items():
            for mgr in data["managers"]:
                org_rows.append((mgr_ids[mgr["name"]], mgr["name"], "partner_manager", region, head_ids[region], mgr_user_ids[mgr["name"]]))

        await conn.executemany("""
            INSERT INTO org_structure (id, name, role, region, parent_id, user_id)
            VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING
        """, org_rows)
        print(f"  org_structure: {len(org_rows)}")

        # ── partners ───────────────────────────────────────────────────────────
        partner_rows = []
        joined = date(2020, 1, 1)
        tier_score = {"strategic": 9.0, "core": 7.5, "growth": 5.8, "observation": 4.0, "risk": 2.5}
        for region, data in REGIONS.items():
            for mgr in data["managers"]:
                for p in mgr["partners"]:
                    tier = PARTNER_TIERS[p]
                    partner_rows.append((
                        partner_ids[p], p, None, region,
                        mgr_ids[mgr["name"]], tier, tier_score[tier], True, joined,
                    ))

        await conn.executemany("""
            INSERT INTO partners (id, name, short_name, region, manager_id,
                                  tier, total_score, is_active, joined_date)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING
        """, partner_rows)
        print(f"  partners: {len(partner_rows)}")

        # ── partner_metrics ────────────────────────────────────────────────────
        print("  Generating metrics (45 partners × 12 months × 27 indicators)...")
        metric_rows = []
        for region, data in REGIONS.items():
            for mgr in data["managers"]:
                for p in mgr["partners"]:
                    pid = partner_ids[p]
                    tier = PARTNER_TIERS[p]
                    for (period, ptype, dim, key, mname, val, unit) in generate_metrics(tier):
                        metric_rows.append((uuid.uuid4(), pid, period, ptype, dim, key, mname, val, unit))

        # Insert in batches of 1000
        BATCH = 1000
        inserted = 0
        for i in range(0, len(metric_rows), BATCH):
            batch = metric_rows[i:i + BATCH]
            await conn.executemany("""
                INSERT INTO partner_metrics
                  (id, partner_id, period, period_type, dimension,
                   metric_key, metric_name, value, unit)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
                ON CONFLICT ON CONSTRAINT uq_partner_period_metric DO NOTHING
            """, batch)
            inserted += len(batch)
            print(f"    {inserted}/{len(metric_rows)}", end="\r")
        print(f"  partner_metrics: {inserted}            ")

        # ── metric_visibility ──────────────────────────────────────────────────
        vis_rows = [(uuid.uuid4(), k, v) for k, v in METRIC_VISIBILITY.items()]
        await conn.executemany("""
            INSERT INTO metric_visibility (id, metric_key, visible_roles)
            VALUES ($1,$2,$3)
            ON CONFLICT (metric_key) DO UPDATE SET visible_roles = EXCLUDED.visible_roles
        """, vis_rows)
        print(f"  metric_visibility: {len(vis_rows)}")

    # ── DuckDB ─────────────────────────────────────────────────────────────────
    print("Syncing to DuckDB...")
    try:
        import duckdb
        rows = await conn.fetch("""
            SELECT pm.id::text, pm.partner_id::text, p.name, p.region, p.tier,
                   pm.period, pm.period_type, pm.dimension,
                   pm.metric_key, pm.metric_name, pm.value::float, pm.unit
            FROM partner_metrics pm
            JOIN partners p ON p.id = pm.partner_id
        """)
        ddb = duckdb.connect(DUCKDB_PATH)
        ddb.execute("DROP TABLE IF EXISTS partner_metrics_cache")
        ddb.execute("""
            CREATE TABLE partner_metrics_cache (
                id TEXT, partner_id TEXT, partner_name TEXT, region TEXT, tier TEXT,
                period TEXT, period_type TEXT, dimension TEXT,
                metric_key TEXT, metric_name TEXT, value DOUBLE, unit TEXT
            )
        """)
        ddb.executemany(
            "INSERT INTO partner_metrics_cache VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            [tuple(r) for r in rows],
        )
        print(f"  DuckDB: {len(rows)} rows in partner_metrics_cache")
        ddb.close()
    except Exception as e:
        print(f"  DuckDB skipped: {e}")

    # ── Verification ───────────────────────────────────────────────────────────
    print("\n=== Verification ===")
    n = await conn.fetchval("SELECT COUNT(*) FROM partners")
    print(f"partners:         {n}")
    n = await conn.fetchval("SELECT COUNT(*) FROM org_structure")
    print(f"org_structure:    {n}")
    n = await conn.fetchval("SELECT COUNT(*) FROM partner_metrics")
    print(f"partner_metrics:  {n}")
    rows = await conn.fetch("SELECT tier, COUNT(*) FROM partners GROUP BY tier ORDER BY tier")
    print(f"tier distribution: { {r['tier']: r['count'] for r in rows} }")

    await conn.close()
    print("\nDone!")


if __name__ == "__main__":
    asyncio.run(main())
