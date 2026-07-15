# 中文视图测试

这是一个用来验证中文列名、中文内容,以及中文视图在 Markdown 页面里嵌入显示的页面。
切换右上角语言开关到「中文」可以看到工具栏和对话框的中文界面。

## 工作清单(中文视图)

```lotion-view
database: db_views_stress
view: view_chinese
```

## 事件日志(中文视图,2K 行)

```lotion-view
database: db_rows_2k
view: view_chinese
```

## 备注: 字段命名与排序

- 字段名支持空格和中文字符,会原样显示在表头。
- 排序使用 `Intl.Collator(numeric: true)`,可以正确处理 ISO 日期字符串、
  混合中英文内容,以及包含数字的字符串。
- 嵌入视图与独立视图共用同一份视图配置(`view.wrapFieldIds`、
  `view.columnWidths`、`view.pageSize`)。
