interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  createdAt: number;
}

export class IxcCacheService {
  private cache = new Map<string, CacheEntry<any>>();
  private hits = 0;
  private misses = 0;
  private defaultTtlSeconds = 60;

  constructor(defaultTtlSeconds = 60) {
    this.defaultTtlSeconds = defaultTtlSeconds;
  }

  /**
   * Obtém item do cache caso não esteja expirado
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    return entry.data as T;
  }

  /**
   * Salva item no cache com TTL em segundos
   */
  set<T>(key: string, data: T, ttlSeconds?: number): void {
    const ttl = ttlSeconds ?? this.defaultTtlSeconds;
    const expiresAt = Date.now() + ttl * 1000;
    this.cache.set(key, {
      data,
      expiresAt,
      createdAt: Date.now(),
    });
  }

  /**
   * Invalida chave específica
   */
  invalidate(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Invalida todas as chaves associadas a um cliente (por ID ou CPF)
   */
  invalidateClient(clientIdOrCpf: string): number {
    let deletedCount = 0;
    const clean = clientIdOrCpf.replace(/\D/g, '');

    for (const key of Array.from(this.cache.keys())) {
      if (key.includes(clientIdOrCpf) || (clean.length > 0 && key.includes(clean))) {
        this.cache.delete(key);
        deletedCount++;
      }
    }

    return deletedCount;
  }

  /**
   * Limpa todo o cache
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Remove itens expirados
   */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of Array.from(this.cache.entries())) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        removed++;
      }
    }
    return removed;
  }

  /**
   * Retorna métricas de hit/miss e tamanho do cache
   */
  getStats() {
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: this.hits + this.misses > 0 ? (this.hits / (this.hits + this.misses)).toFixed(2) : '0.00',
    };
  }
}

export const ixcCache = new IxcCacheService(60);
