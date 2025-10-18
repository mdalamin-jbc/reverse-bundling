#!/usr/bin/env node

/**
 * Load Testing Script for Reverse Bundling App
 * Tests concurrent merchant capacity and performance optimizations
 */

import http from 'http';
import https from 'https';
import { performance } from 'perf_hooks';

const BASE_URL = process.env.APP_URL || 'http://localhost:3000';
const CONCURRENT_USERS = parseInt(process.env.CONCURRENT_USERS || '120');
const REQUESTS_PER_USER = parseInt(process.env.REQUESTS_PER_USER || '10');
const DELAY_BETWEEN_REQUESTS = parseInt(process.env.DELAY_MS || '100');

console.log('🚀 Starting Load Test for Reverse Bundling App');
console.log('================================================');
console.log(`Target URL: ${BASE_URL}`);
console.log(`Concurrent Users: ${CONCURRENT_USERS}`);
console.log(`Requests per User: ${REQUESTS_PER_USER}`);
console.log(`Delay between requests: ${DELAY_BETWEEN_REQUESTS}ms`);
console.log('================================================\n');

// Test endpoints that use our optimizations
const endpoints = [
  '/app/orders',      // Uses pagination + caching
  '/app/bundle-rules', // Uses pagination + caching
  '/app/analytics',    // Uses pagination + caching
  '/app',             // Dashboard with analytics
];

class LoadTester {
  constructor() {
    this.results = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      responseTimes: [],
      errors: [],
      startTime: 0,
      endTime: 0
    };
  }

  makeRequest(url, userId) {
    return new Promise((resolve) => {
      const startTime = performance.now();
      const protocol = url.startsWith('https') ? https : http;

      const req = protocol.get(url, {
        headers: {
          'User-Agent': `LoadTest-User-${userId}`,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        },
        timeout: 30000 // 30 second timeout
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          const endTime = performance.now();
          const responseTime = endTime - startTime;

          this.results.responseTimes.push(responseTime);
          this.results.totalRequests++;

          if (res.statusCode >= 200 && res.statusCode < 300) {
            this.results.successfulRequests++;
            console.log(`✅ User ${userId}: ${res.statusCode} - ${responseTime.toFixed(2)}ms`);
          } else {
            this.results.failedRequests++;
            console.log(`❌ User ${userId}: ${res.statusCode} - ${responseTime.toFixed(2)}ms`);
          }

          resolve({ statusCode: res.statusCode, responseTime, data: data.length });
        });
      });

      req.on('error', (error) => {
        const endTime = performance.now();
        const responseTime = endTime - startTime;

        this.results.responseTimes.push(responseTime);
        this.results.totalRequests++;
        this.results.failedRequests++;
        this.results.errors.push(error.message);

        console.log(`💥 User ${userId}: ERROR - ${responseTime.toFixed(2)}ms - ${error.message}`);
        resolve({ error: error.message, responseTime });
      });

      req.on('timeout', () => {
        req.destroy();
        const endTime = performance.now();
        const responseTime = endTime - startTime;

        this.results.responseTimes.push(responseTime);
        this.results.totalRequests++;
        this.results.failedRequests++;
        this.results.errors.push('Timeout');

        console.log(`⏰ User ${userId}: TIMEOUT - ${responseTime.toFixed(2)}ms`);
        resolve({ error: 'Timeout', responseTime });
      });
    });
  }

  async simulateUser(userId) {
    console.log(`👤 Starting User ${userId}`);

    for (let i = 0; i < REQUESTS_PER_USER; i++) {
      // Random endpoint selection
      const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
      const url = `${BASE_URL}${endpoint}`;

      await this.makeRequest(url, userId);

      // Delay between requests
      if (i < REQUESTS_PER_USER - 1) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
      }
    }

    console.log(`✅ User ${userId} completed`);
  }

  calculateStats() {
    const responseTimes = this.results.responseTimes;
    const sortedTimes = [...responseTimes].sort((a, b) => a - b);

    return {
      totalRequests: this.results.totalRequests,
      successfulRequests: this.results.successfulRequests,
      failedRequests: this.results.failedRequests,
      successRate: (this.results.successfulRequests / this.results.totalRequests * 100).toFixed(2),
      avgResponseTime: responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length,
      minResponseTime: Math.min(...responseTimes),
      maxResponseTime: Math.max(...responseTimes),
      p50ResponseTime: sortedTimes[Math.floor(sortedTimes.length * 0.5)],
      p95ResponseTime: sortedTimes[Math.floor(sortedTimes.length * 0.95)],
      p99ResponseTime: sortedTimes[Math.floor(sortedTimes.length * 0.99)],
      totalDuration: this.results.endTime - this.results.startTime,
      requestsPerSecond: this.results.totalRequests / ((this.results.endTime - this.results.startTime) / 1000),
      errorCount: this.results.errors.length,
      uniqueErrors: [...new Set(this.results.errors)]
    };
  }

  printResults(stats) {
    console.log('\n📊 Load Test Results');
    console.log('===================');
    console.log(`Total Requests: ${stats.totalRequests}`);
    console.log(`Successful: ${stats.successfulRequests} (${stats.successRate}%)`);
    console.log(`Failed: ${stats.failedRequests}`);
    console.log(`Errors: ${stats.errorCount}`);
    if (stats.uniqueErrors.length > 0) {
      console.log(`Error Types: ${stats.uniqueErrors.join(', ')}`);
    }

    console.log('\n⏱️  Response Times (ms)');
    console.log('======================');
    console.log(`Average: ${stats.avgResponseTime.toFixed(2)}`);
    console.log(`Min: ${stats.minResponseTime.toFixed(2)}`);
    console.log(`Max: ${stats.maxResponseTime.toFixed(2)}`);
    console.log(`50th percentile: ${stats.p50ResponseTime.toFixed(2)}`);
    console.log(`95th percentile: ${stats.p95ResponseTime.toFixed(2)}`);
    console.log(`99th percentile: ${stats.p99ResponseTime.toFixed(2)}`);

    console.log('\n⚡ Performance Metrics');
    console.log('=====================');
    console.log(`Total Duration: ${(stats.totalDuration / 1000).toFixed(2)}s`);
    console.log(`Requests/Second: ${stats.requestsPerSecond.toFixed(2)}`);

    console.log('\n🎯 Capacity Assessment');
    console.log('=====================');
    if (stats.successRate >= 95 && stats.p95ResponseTime < 5000) {
      console.log('✅ EXCELLENT: System handles load well');
      console.log(`   Estimated capacity: ${CONCURRENT_USERS}+ concurrent merchants`);
    } else if (stats.successRate >= 90 && stats.p95ResponseTime < 10000) {
      console.log('⚠️  GOOD: System handles load adequately');
      console.log(`   Estimated capacity: ${Math.floor(CONCURRENT_USERS * 0.8)}-merchant range`);
    } else {
      console.log('❌ POOR: System struggling under load');
      console.log('   Consider further optimizations or infrastructure upgrades');
    }
  }

  async run() {
    console.log(`🚀 Starting load test with ${CONCURRENT_USERS} concurrent users...\n`);

    this.results.startTime = performance.now();

    // Create concurrent users
    const userPromises = [];
    for (let i = 1; i <= CONCURRENT_USERS; i++) {
      userPromises.push(this.simulateUser(i));
    }

    // Wait for all users to complete
    await Promise.all(userPromises);

    this.results.endTime = performance.now();

    // Calculate and print results
    const stats = this.calculateStats();
    this.printResults(stats);

    console.log('\n🏁 Load test completed!');
  }
}

// Run the load test
const tester = new LoadTester();
tester.run().catch(console.error);