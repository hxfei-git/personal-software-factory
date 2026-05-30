# Technical Notes

## 相关项目命令
- install: `python -m venv .venv`, `. .venv/bin/activate && pip install -e .`, `npm --prefix web/frontend install`
- test: `. .venv/bin/activate && pytest -q`
- build: `npm --prefix web/frontend run build`
- run_staging: `. .venv/bin/activate && ai-novelist web --host 127.0.0.1 --port 8000`

## 相关核心流程
- 打开首页 (open_home, P0)
- 新建小说项目 (create_novel_project, P0)
- 生成世界观 (generate_worldview, P0)
- 生成大纲 (generate_outline, P0)
- 生成章节 (generate_chapter, P0)
- 自动审稿 (review_chapter, P0)
- 修复章节 (repair_chapter, P0)
- 导出小说 (export_novel, P1)

## 推荐修改区域
- 根据需求优先定位现有业务模块、测试目录和文档。
- 保持 Mission Planner 输出为本地 artifact，不接入 API 或 Worker 执行。

## 推荐测试策略
- 优先运行与变更面最接近的单元或集成测试。
- 再运行 Project Passport 声明的关键测试命令。
- QA Charter:
  # QA Charter - AI 小说助手
  
  ## Normal Paths
  
  1. 打开首页
  2. 新建小说项目
  3. 输入小说题材
  4. 生成世界观
  5. 生成大纲
  6. 生成章节
  7. 自动审稿
  8. 查看审稿报告
  9. 修复章节
  10. 导出小说
  
  ## Abnormal Paths
  
  1. 空输入提交
  2. 超长输入提交
  3. 连续点击生成按钮
  4. 生成过程中刷新页面
  5. 生成过程中后退
  6. 多标签页同时操作
  7. API 失败
  8. 审稿失败
  9. 修复失败
  10. 导出前跳过审稿
  
