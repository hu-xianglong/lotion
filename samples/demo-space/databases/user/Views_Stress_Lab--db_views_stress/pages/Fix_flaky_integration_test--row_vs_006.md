# Fix flaky integration test

> 中文标题: **修复偶发失败的集成测试**

**Status:** Done · **Priority:** High · **Team:** Design

## Owner notes

横跨渲染层、preload 边界和主进程,风险偏高,需要分步合并。

## Plan

- [ ] Reproduce the symptom locally.
- [ ] Identify the smallest fix.
- [ ] Add a regression test.

## Background

Spans renderer, preload boundary, and main process — file under risky.
