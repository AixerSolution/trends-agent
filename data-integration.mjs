/**
 * DATA INTEGRATION MODULE — Trends Agent
 * Real API connectors for SE Asian e-commerce & social platforms.
 * Used when platform credentials are available; the main agent falls back to
 * mock data when they are not.
 */

import https from "https";
import crypto from "crypto";

// =============================================================================
// 1. SHOPEE
// =============================================================================

export class ShopeeConnector {
  constructor(partnerId, partnerKey, shopId = null) {
    this.partnerId = partnerId;
    this.partnerKey = partnerKey;
    this.shopId = shopId;
    this.baseUrl = "https://partner.shopeemall.com/api/v2";
  }

  _sign(path, body = "") {
    return crypto
      .createHmac("sha256", this.partnerKey)
      .update(`${path}${body}`)
      .digest("hex");
  }

  _request(path, method = "GET", body = null) {
    const timestamp = Math.floor(Date.now() / 1000);
    const headers = {
      "Content-Type": "application/json",
      Authorization: this._sign(path, body ?? ""),
      "X-Partner-ID": this.partnerId,
      "X-Timestamp": timestamp,
    };
    return new Promise((resolve, reject) => {
      const req = https.request(
        { hostname: "partner.shopeemall.com", path: `/api/v2${path}`, method, headers },
        (res) => {
          let data = "";
          res.on("data", (c) => (data += c));
          res.on("end", () => {
            try { resolve(JSON.parse(data)); } catch { resolve(data); }
          });
        }
      );
      req.on("error", reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  getTrendingProducts(category, offset = 0, limit = 50) {
    return this._request(`/product/search?category=${category}&offset=${offset}&limit=${limit}`);
  }

  getProductDetails(itemId) {
    return this._request(`/product/get?item_id=${itemId}`);
  }

  getProductReviews(itemId, offset = 0, limit = 50) {
    return this._request(`/product/get_review?item_id=${itemId}&offset=${offset}&limit=${limit}`);
  }

  async analyzeProductSentiment(itemId) {
    const reviews = await this.getProductReviews(itemId, 0, 100);
    if (!reviews.data?.reviews) return { status: "error", message: "No reviews found" };

    let pos = 0, neg = 0;
    const freq = {};
    for (const r of reviews.data.reviews) {
      if (r.rating >= 4) pos++;
      else if (r.rating <= 2) neg++;
      for (const w of r.comment_content.toLowerCase().split(/\s+/).filter((w) => w.length > 3)) {
        freq[w] = (freq[w] || 0) + 1;
      }
    }
    const total = reviews.data.reviews.length;
    const topKeywords = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10).map((e) => e[0]);
    return {
      total_reviews: total,
      positive_pct: Math.round((pos / total) * 100),
      negative_pct: Math.round((neg / total) * 100),
      avg_rating: reviews.data.average_rating,
      top_keywords: topKeywords,
      sentiment_score: Math.round((pos / total) * 100),
    };
  }
}

// =============================================================================
// 2. LAZADA
// =============================================================================

export class LazadaConnector {
  constructor(appKey, appSecret) {
    this.appKey = appKey;
    this.appSecret = appSecret;
    this.baseUrl = "https://api.lazada.com/rest";
    this.accessToken = null;
  }

  _sign(path, params) {
    const sorted = Object.keys(params).sort().map((k) => `${k}${params[k]}`).join("");
    return crypto.createHmac("sha256", this.appSecret).update(path + sorted + this.appSecret).digest("hex");
  }

  _request(path, params = {}) {
    if (this.accessToken) params.access_token = this.accessToken;
    const sign = this._sign(path, params);
    const qs = new URLSearchParams({ ...params, sign, app_key: this.appKey, timestamp: Date.now() }).toString();
    return new Promise((resolve, reject) => {
      https.get(`${this.baseUrl}${path}?${qs}`, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
      }).on("error", reject);
    });
  }

  searchProducts(keyword, limit = 100) { return this._request("/product/search", { q: keyword, limit, page: 1 }); }
  getProductDetails(productId) { return this._request("/product/detail/get", { item_id: productId }); }
  getCategoryTrends(categoryId) { return this._request("/product/trending/list", { category_id: categoryId, limit: 50 }); }
  getProductReviews(productId, limit = 100) { return this._request("/product/review/search", { item_id: productId, limit, page: 1 }); }
}

// =============================================================================
// 3. TIKTOK SHOP
// =============================================================================

export class TikTokShopConnector {
  constructor(accessToken, shopId) {
    this.accessToken = accessToken;
    this.shopId = shopId;
  }

  _request(endpoint, method = "GET", body = null) {
    const headers = {
      Authorization: `Bearer ${this.accessToken}`,
      "Content-Type": "application/json",
      "Shop-Cipher": this.shopId,
    };
    return new Promise((resolve, reject) => {
      const req = https.request(
        { hostname: "open-api.tiktokshop.com", path: endpoint, method, headers },
        (res) => {
          let data = "";
          res.on("data", (c) => (data += c));
          res.on("end", () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
        }
      );
      req.on("error", reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  getShopInfo() { return this._request("/v1/shop/get"); }
  getProducts(limit = 100, cursor = null) {
    return this._request(`/v1/products?limit=${limit}${cursor ? `&cursor=${cursor}` : ""}`);
  }
  getProductDetails(id) { return this._request(`/v1/products/${id}`); }
  getProductAnalytics(id, timeRange = "7d") {
    return this._request(`/v1/products/${id}/analytics?time_range=${timeRange}`);
  }
}

// =============================================================================
// 4. GOOGLE TRENDS (via SearchAPI.io)
// =============================================================================

export class GoogleTrendsConnector {
  constructor(apiKey) { this.apiKey = apiKey; }

  _get(params) {
    const qs = new URLSearchParams({ ...params, api_key: this.apiKey }).toString();
    return new Promise((resolve, reject) => {
      https.get(`https://www.searchapi.io/api/v1/search?${qs}`, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
      }).on("error", reject);
    });
  }

  // What's trending right now in a country (no keyword needed)
  getTrendingNow(countryCode = "SG") {
    return this._get({ engine: "google_trends_trending_now", geo: countryCode });
  }

  // Interest over time for a specific keyword
  getInterestOverTime(keyword, countryCode = "SG") {
    return this._get({ engine: "google_trends", q: keyword, geo: countryCode, date: "today 3-m", data_type: "TIMESERIES" });
  }

  // Related rising queries — surfaces adjacent trends
  getRelatedQueries(keyword, countryCode = "SG") {
    return this._get({ engine: "google_trends", q: keyword, geo: countryCode, date: "today 3-m", data_type: "RELATED_QUERIES" });
  }
}

// =============================================================================
// 5. SOCIAL SENTIMENT
// =============================================================================

export class SocialSentimentConnector {
  analyzeSentiment(texts) {
    const pos = ["love", "amazing", "great", "excellent", "perfect", "awesome"];
    const neg = ["hate", "terrible", "bad", "awful", "poor", "worst"];
    return texts.map((text) => {
      let score = 0.5;
      pos.forEach((w) => { if (text.toLowerCase().includes(w)) score += 0.1; });
      neg.forEach((w) => { if (text.toLowerCase().includes(w)) score -= 0.1; });
      score = Math.max(0, Math.min(1, score));
      return { text, sentiment_score: score, label: score > 0.6 ? "positive" : score < 0.4 ? "negative" : "neutral" };
    });
  }
}

// =============================================================================
// 6. UNIFIED ANALYZER  (wires all connectors together)
// =============================================================================

export class UnifiedTrendAnalyzer {
  constructor(credentials) {
    this.shopee = new ShopeeConnector(credentials.shopee.partnerId, credentials.shopee.partnerKey);
    this.lazada = new LazadaConnector(credentials.lazada.appKey, credentials.lazada.appSecret);
    this.tiktokShop = new TikTokShopConnector(credentials.tiktokShop.accessToken, credentials.tiktokShop.shopId);
    this.googleTrends = new GoogleTrendsConnector(credentials.googleTrends.apiKey);
    this.socialSentiment = new SocialSentimentConnector();
  }

  async analyzeProductOpportunity(productName, country = "VN") {
    console.log(`\n📊 Analysing "${productName}" in ${country}...`);
    try {
      const [shopeeResults, lazadaResults, googleTrendsData] = await Promise.all([
        this.shopee.getTrendingProducts(productName),
        this.lazada.searchProducts(productName),
        this.googleTrends.getRegionalInterest(productName, country),
      ]);

      const sentiment = this._aggregateSentiment(shopeeResults, lazadaResults);
      const score = this.calculateOpportunityScore({
        search_volume: googleTrendsData.search_interest,
        seller_count: this._estimateCompetition(shopeeResults, lazadaResults),
        avg_rating: sentiment.avg_rating,
        review_count: sentiment.total_reviews,
        growth_trend: googleTrendsData.trend_direction,
      });

      return {
        product: productName,
        country,
        sentiment,
        opportunity_score: score,
        recommendation: this.generateRecommendation(score),
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      console.error(`Error analysing ${productName}:`, err.message);
      return { product: productName, error: err.message };
    }
  }

  _estimateCompetition(shopee, lazada) {
    return Math.max(shopee.data?.count || 0, lazada.data?.count || 0);
  }

  _aggregateSentiment(shopee, lazada) {
    let total = 0, sumRating = 0;
    for (const item of shopee.data?.items || []) {
      if (item.rating_count > 0) { sumRating += item.rating_avg * item.rating_count; total += item.rating_count; }
    }
    for (const p of lazada.data?.products || []) {
      if (p.rating_count > 0) { sumRating += p.rating * p.rating_count; total += p.rating_count; }
    }
    const avg = total > 0 ? sumRating / total : 4.0;
    return { avg_rating: Math.round(avg * 10) / 10, total_reviews: total, sentiment_score: Math.round((avg / 5) * 100) };
  }

  calculateOpportunityScore({ search_volume = 0, seller_count = 0, avg_rating = 4, review_count = 0, growth_trend = "stable" }) {
    const searchScore = Math.min((search_volume / 1_000_000) * 100, 100);
    const competitionScore = Math.max(100 - (seller_count / 1000) * 100, 0);
    const ratingScore = (avg_rating / 5) * 100;
    const reviewScore = Math.min((review_count / 10000) * 100, 100);
    const trend = growth_trend === "rising" ? 1.2 : growth_trend === "falling" ? 0.8 : 1.0;
    return Math.round((searchScore * 0.3 + competitionScore * 0.3 + ratingScore * 0.2 + reviewScore * 0.2) * trend);
  }

  generateRecommendation(score) {
    if (score >= 80) return "HIGHLY RECOMMENDED — strong opportunity";
    if (score >= 70) return "RECOMMENDED — good opportunity";
    if (score >= 60) return "MONITOR — showing potential, track trends";
    return "LOW PRIORITY — limited opportunity currently";
  }
}
