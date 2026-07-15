# Scale Demo · 20K embedded

This page embeds three slices of the 20K-row stress dataset. Each
embed is virtualized, so only the rows in the embed's viewport (~12 at
a time) are in the DOM; scroll inside the embed and the rest stream
in as needed.

If everything is wired correctly, opening this page should feel just as
snappy as opening the small demo databases.

## 20K · all rows, default sort

```lotion-view
database: db_rows_20k
view: view_default
```

## 20K · high severity (~4K rows)

```lotion-view
database: db_rows_20k
view: view_high
```

## 20K · resolved (~11K rows)

```lotion-view
database: db_rows_20k
view: view_resolved
```
